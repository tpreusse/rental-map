var fs = require('fs');
var request = require('request');
var Q = require('q');

var requestQueue = Q(0);

function get(options) {
    var deferred = Q.defer();
    requestQueue = requestQueue.then(function() {
        var requestDeferred = Q.defer();
        console.log('get', options.url, options);
        request.get(options, function(error, response, data) {
            if(!error && response.statusCode == 200) {
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
    clusters = require('./clusters.json'),
    ads = require('./ads.json'),
    details = require('./details.json');

function fetchClusters() {
    var clustersDeferred = Q.defer();

    var pendingClusters = function() {
            return clusters.filter(function(c) {
                return !c.LastFetched;
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
                        return c.LowerLeftLat == aCluster.LowerLeftLat &&
                            c.LowerLeftLng == aCluster.LowerLeftLng &&
                            c.UpperRightLat == aCluster.UpperRightLat &&
                            c.UpperRightLng == aCluster.UpperRightLng;
                    });
                    if(!exists.length) {
                        clusters.push(aCluster);
                    }
                });
                (data.Marker || []).forEach(function(aMarker) {
                    aMarker.AdIds.forEach(function(AdId) {
                        var exists = ads.filter(function(a) {
                            return a.AdId == AdId;
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
                fs.writeFile('clusters.json', JSON.stringify(clusters, null, 4), 'utf8');
                fs.writeFile('ads.json', JSON.stringify(ads, null, 4), 'utf8');
            });
        })
    ).then(function(promises) {
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
            var exists = details.filter(function(d) {
                return d.AdId == detail.AdId;
            });
            if(!exists.length) {
                detail.LastFetched = new Date().toJSON();
                details.push(detail);
            }
        });
        console.log('details', details.length);
        fs.writeFile('details.json', JSON.stringify(details, null, 4), 'utf8');
    });
}

function fetchPendingDetails() {
    console.log('details', details.length);
    var fetchedDetails = details.map(function(d) {
        // imp: check detail.LastFetched for age
        return d.AdId;
    });

    var pendingDetails = ads.filter(function(ad) {
        return fetchedDetails.indexOf(ad.AdId) === -1;
    }).map(function(d) {
        return d.AdId;
    });
    console.log('pending details', pendingDetails.length);

    var fetchers = [];
    while(pendingDetails.length) {
        fetchers.push(fetchDetails(pendingDetails.splice(0, 10)));
    }
    return Q.allSettled(fetchers);
}

exports.fetchClusters = fetchClusters;
exports.fetchDetails = fetchPendingDetails;