var fs = require('fs');
var request = require('request');
var Q = require('q');
var _ = require('lodash');

var requestQueue = Q(0);

function get(options) {
    var deferred = Q.defer();
    requestQueue = requestQueue.then(function() {
        var requestDeferred = Q.defer();
        console.log('get', options.url, options);
        request.get(options, function(error, response, data) {
            if(!error && response.statusCode === 200) {
                deferred.resolve(data);
            }
            else {
                console.log('fail', options, arguments);
                deferred.reject("Can't do it");
            }
            setTimeout(function() {
                requestDeferred.resolve();
            }, 3000);
        });
        return requestDeferred.promise;
    });
    return deferred.promise;
}

var rk = 1,
    clusters = require('./data/clusters.json'),
    ads = require('./data/ads.json'),
    details = require('./data/details.json');

var refetchAge = new Date();
    refetchAge.setHours(refetchAge.getHours() - 6);

function fetchClusters() {
    var clustersDeferred = Q.defer();

    var pendingClusters = function() {
            return clusters.filter(function(c) {
                return !c.LastFetched || (new Date(c.LastFetched)) < refetchAge;
            });
        },
        pending = pendingClusters();

    console.log('clusters', clusters.length);
    console.log('pending clusters', pending.length);

    Q.allSettled(
        pending.map(function(cluster) {
            return get({
                url: "https://www.comparis.ch/immobilien/Handlers/Geo_v1?" +
                    "type=adlayer&is_mashup=false&is_user_viewport=true&dealtype=rent" +
                    "&rk=" + rk +
                    "&lowerleft_lat=" + cluster.LowerLeftLat +
                    "&lowerleft_lng=" + cluster.LowerLeftLng +
                    "&upperright_lat=" + cluster.UpperRightLat +
                    "&upperright_lng=" + cluster.UpperRightLng,
                json: true
            }).then(function(data) {
                (data.Clusters || []).forEach(function(aCluster) {
                    var exists = clusters.filter(function(c) {
                        return c.LowerLeftLat === aCluster.LowerLeftLat &&
                            c.LowerLeftLng === aCluster.LowerLeftLng &&
                            c.UpperRightLat === aCluster.UpperRightLat &&
                            c.UpperRightLng === aCluster.UpperRightLng;
                    });
                    if(!exists.length) {
                        clusters.push(aCluster);
                    }
                });
                (data.Marker || []).forEach(function(aMarker) {
                    aMarker.AdIds.forEach(function(AdId) {
                        var exists = ads.filter(function(a) {
                            return a.AdId === AdId;
                        });
                        if(!exists.length) {
                            ads.push({
                                AdId: AdId,
                                AdType: aMarker.AdType,
                                DisplayText: aMarker.DisplayText,
                                GeoPosLat: aMarker.GeoPosLat,
                                GeoPosLng: aMarker.GeoPosLng
                            });
                        }
                    });
                });
                cluster.LastFetched = new Date().toJSON();

                console.log('clusters', clusters.length);
                console.log('ads', ads.length);
                fs.writeFileSync('data/clusters.json', JSON.stringify(clusters, null, 4), 'utf8');
                fs.writeFileSync('data/ads.json', JSON.stringify(ads, null, 4), 'utf8');
            });
        })
    ).then(function() {
        if(pendingClusters().length) {
            fetchClusters().then(function(){
                clustersDeferred.resolve();
            });
        }
        else {
            clustersDeferred.resolve();
        }
    });
    return clustersDeferred.promise;
}

function fetchDetails(ids) {
    ids = ids.filter(function(id) {
        return id;
    });
    return get({url: "https://www.comparis.ch/immobilien/Handlers/Geo_v1?rk=15&type=detail&is_mashup=false&adids=" + ids.join(',') + "&dealtype=rent", json: true}).then(function(data) {
        (data.Detail || []).forEach(function(detail) {
            detail.LastFetched = new Date().toJSON();
            var index = _.findIndex(details, function(d) {
                return d.AdId === detail.AdId;
            });
            if(index !== -1) {
                details[index] = detail;
            }
            else {
                details.push(detail);
            }
        });
        console.log('details', details.length);
        fs.writeFileSync('data/details.json', JSON.stringify(details, null, 4), 'utf8');
    });
}

function fetchPendingDetails() {
    console.log('details', details.length);

    var fetchedDetails = details.map(function(d) {
        if((new Date(d.LastFetched)) > refetchAge || d.AdType === 'Historic') {
            return d.AdId;
        }
    });

    var pendingDetails = ads.filter(function(ad) {
        return fetchedDetails.indexOf(ad.AdId) === -1;
    }).map(function(d) {
        return d.AdId;
    });
    console.log('pending details', pendingDetails.length);

    var fetchers = [];
    while(pendingDetails.length) {
        fetchers.push(fetchDetails(pendingDetails.splice(0, 40)));
    }
    return Q.allSettled(fetchers);
}

function generateGeoJson() {
    var features = [];

    var updateDate;

    details.filter(function(d) { return d.AdType === 'Actual'; }).forEach(function(d) {
        var m = _.find(ads, function(a) { return d.AdId === a.AdId; });

        var rental_type = d.HistoryGroup.split(','),
            street = (d.Street + " " + (d.StreetNumber ? d.StreetNumber : '')).replace(/^\s+|\s+$/g, ''),
            image = d.ImageUrl;

        if(image) {
            image = String(d.ImageUrl).replace(/&(w|h)=\d+/g, '');
            if(!image.match(/^http/)) {
                image = "https://www.comparis.ch" + image;
            }
        }

        var featureUpdateDate = new Date(d.LastFetched);
        if(!updateDate || updateDate < featureUpdateDate) {
            updateDate = featureUpdateDate;
        }

        features.push({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [m.GeoPosLng,m.GeoPosLat]
            },
            "properties": {
                "source_id": d.AdId,
                "source": "comparis",
                "rental_type": rental_type[0],
                "href": d.DetailUrl,
                "image": image,
                "price": d.Price,
                "space": d.LivingSpace,
                "rooms": d.Rooms,
                "zip": d.Zip,
                "city": d.City,
                "street": street,
                "floor": d.floor,
                "create_date": new Date(
                    +d.CreateDate
                        .replace('/Date(', '')
                        .replace(')/', '')
                        .split('+')[0]
                ).toJSON()
            }
        });
    });
    console.log('features', features.length);

    fs.writeFileSync('app/geojson.json', JSON.stringify({
        "type": "FeatureCollection",
        "properties": {
            "update": updateDate.toJSON()
        },
        "features": features
    }, null, 4), 'utf8');
}

// maybe crawl detail page
// https://github.com/MatthewMueller/cheerio

exports.fetchClusters = fetchClusters;
exports.fetchDetails = fetchPendingDetails;
exports.generateGeoJson = generateGeoJson;
