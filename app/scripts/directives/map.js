'use strict';

angular.module('flatApp').directive('map', function($timeout, debounce) {
  return {
    restrict: 'A',
    link: function($scope, $element, attrs) {
      var bBox = L.latLngBounds(L.latLng(47.3100548886702, 8.422644311746353), L.latLng(47.429105601447496, 8.63893764670729));

      var options = JSON.parse(attrs.mapOptions);
      if(angular.isString(options.center)) {
        options.center = options.center.split(',');
      }

      var map = window.map = L.mapbox.map($element[0], attrs.map, {
        center: options.center || bBox.getCenter(),
        zoom: options.zoom || 13,
        minZoom: 11,
        maxZoom: 18,
        maxBounds: bBox
      });

      var saveState = debounce(function() {
        $scope.mapState = {
          bounds: map.getBounds(),
          center: map.getCenter(),
          zoom: map.getZoom()
        };
      }, 200);

      map.on('moveend zoomend', saveState);
      saveState();

      // var featureLayer = L.mapbox.featureLayer()
      //   .addTo(map);

      // $scope.$watch('geoJson', function(value) {
      //   if(value) {
      //     value.features.forEach(function(f) {
      //       var marker = L.circleMarker(new L.LatLng(f.geometry.coordinates[1], f.geometry.coordinates[0]), {
      //         radius: 4,
      //         color: '#000'
      //       });
      //       marker.bindPopup(
      //         f.properties.street
      //       );
      //       featureLayer.addLayer(marker);
      //     });
      //     // featureLayer.setGeoJSON(value);
      //   }
      // });
      // map.setMaxBounds();

      // clusters
      var radius = 6,
        markers = new L.MarkerClusterGroup({
        spiderfyOnMaxZoom: true,
        maxClusterRadius: radius * 3,
        iconCreateFunction: function(cluster) {
          var childCount = cluster.getChildCount(),
            area = (Math.PI * (radius * radius)) * childCount,
            size = Math.sqrt(area / Math.PI) * 2;

          var colors = {};
          cluster.getAllChildMarkers().sort(function(a, b) {
            // keep color order consistent between redraws
            return a.options.color > b.options.color;
          }).forEach(function(m) {
            var color = m.options.color;
            colors[color] = (colors[color] || 0) + 1;
          });

          var gradient = ['to bottom'], start = 0;
          angular.forEach(colors, function(count, color) {
            var percent = Math.round(count / childCount * 100);
            gradient.push(color+' '+start+'%');
            start += percent;
            gradient.push(color+' '+start+'%');
          });

          gradient = 'linear-gradient(' + gradient.join(', ') + ')';
          return new L.DivIcon({ html: '<div style="width:'+size+'px;height:'+size+'px; background-image:'+gradient+';""></div>', className: 'marker-cluster', iconSize: new L.Point(size, size) });
        }
      });

      var createMarker = _.memoize(function(o) {
        var title = o.street;
        var marker = L.circleMarker(new L.LatLng(o.lat, o.lng), {
          radius: radius,
          stroke: false,
          fillOpacity: 0.7,
          color: $scope.typeScale(o.rental_type)
        });
        marker.bindPopup(title);
        return marker;
      }, function(o) { return o.id; });

      var drawMarkers = debounce(function(objects) {
        markers.clearLayers();
        var layers = [];
        objects.forEach(function(o) {
          layers.push(createMarker(o));
        });
        markers.addLayers(layers);
      }, 10);

      $scope.$watch('filteredObjects', function(value) {
        if(value) {
          drawMarkers(value);
        }
      });

      map.addLayer(markers);
    }
  };
});
