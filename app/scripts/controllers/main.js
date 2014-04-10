'use strict';

angular.module('flatApp')
.controller('MainCtrl', function($scope, $http, $filter, $location) {
  var makeFilterItems = $filter('makeFilterItems');
  var initialSearchQuery = angular.copy($location.search());

  var dataRequest = $http.get('geojson.json').success(function(data){
    $scope.objects = data.features.map(function(o) {
      var simple = o.properties;
      simple.id = simple.source + simple.source_id;
      simple.lat = o.geometry.coordinates[1];
      simple.lng = o.geometry.coordinates[0];
      return simple;
    });
    $scope.filter = makeFilterItems($scope.objects, "rental_type", initialSearchQuery.type, true);
  });
  $scope.filterByRentalType = function(item) {
    return $scope.filter.check[item.rental_type];
  };

  function filterObjects() {
    var objects = $scope.objects;
    if($scope.mapState && $scope.mapState.bounds) {
      objects = $filter('filter')(objects, function(o) {
        return $scope.mapState.bounds.contains(new L.LatLng(o.lat, o.lng));
      });
    }
    objects = $filter('filter')(objects, $scope.filterByRentalType);
    objects = $filter('orderBy')(objects, 'price');
    $scope.filteredObjects = objects;
  }
  // rounds coordinates before setting to state model
  // https://en.wikipedia.org/wiki/Wikipedia:WikiProject_Geographical_coordinates#Precision_guidelines
  // 0.0001° = 5 - 10m accuracy
  // should be enough and makes urls shorter
  function coordsRound(n) {
    return Math.round(n * 10000) / 10000;
  }

  $scope.mapState = {
    center: initialSearchQuery.c,
    zoom: initialSearchQuery.z || 13
  };

  // pagi
  dataRequest.then(function() {
    $scope.currentPage = initialSearchQuery.p || 1;
  });
  $scope.numPerPage = 21;

  function paginateObjects() {
    if(!angular.isArray($scope.filteredObjects)) { return; }
    var begin = (($scope.currentPage - 1) * $scope.numPerPage),
        end = begin + $scope.numPerPage;

    $scope.pagedFilteredObjects = $scope.filteredObjects.slice(begin, end);
  }
  $scope.$watchCollection('filteredObjects', function(value, old) {
    if(value !== old) {
      paginateObjects();
    }
  });
  $scope.$watch('currentPage + numPerPage', function() {
    $location.search('p', $scope.currentPage).replace();
    paginateObjects();
  });

  $scope.$watchCollection('objects', filterObjects);
  $scope.$watchCollection('filter.check', function() {
    if(!$scope.filter) { return; }
    var checked = [];
    angular.forEach($scope.filter.check, function(value, key) {
      if(value) {
        checked.push(key);
      }
    });
    $location.search('type', checked.join(',')).replace();
    filterObjects();
  });
  $scope.$watch('mapState', function(value, old) {
    if(value === old) { return; }

    $location
      .search('c', [$scope.mapState.center.lat, $scope.mapState.center.lng].map(coordsRound).join(','))
      .search('z', $scope.mapState.zoom)
      .replace();

    filterObjects();
  });

  window.$d = $scope;

  $scope.typeScale = d3.scale.category20();
});
