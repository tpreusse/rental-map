'use strict';

angular.module('flatApp')
.controller('MainCtrl', function($scope, $http, $filter, $location, $window) {
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
    objects = $filter('filter')(objects, function(item) {
      var pass = true;
      if(item.price < ($scope.priceMin || 0) && item.price !== 0) {
        pass = false;
      }
      if($scope.priceMax && item.price > $scope.priceMax) {
        pass = false;
      }
      return pass;
    });
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
      generatePriceData('Viewport', $scope.filteredObjects);
    }
  });
  $scope.$watch('currentPage + numPerPage', function() {
    $location.search('p', $scope.currentPage).replace();
    paginateObjects();
  });

  $scope.$watchCollection('objects', function() {
    if(!$scope.objects) { return; }
    // generatePriceData('All', $scope.objects);
    filterObjects();
  });
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

  $scope.priceMin = initialSearchQuery.min;
  $scope.priceMax = initialSearchQuery.max;
  $scope.$watch('priceMin + priceMax', function(value, old) {
    if(value === old) { return; }

    $location
      .search('min', $scope.priceMin)
      .search('max', $scope.priceMax)
      .replace();

    filterObjects();
  });

  window.$d = $scope;

  $scope.typeScale = d3.scale.category20();


  var colorForKey = {
    'All': '#ccc',
    'Viewport': '#428bca'
  };

  function generatePriceData(key, objects) {
    var counters = {};
    objects.forEach(function(objects) {
      if(!objects.price) { return; }
      counters[objects.price] = (counters[objects.price] || 0) + 1;
    });
    var values = [{x: 0, y: 0, size: 0}];
    angular.forEach(counters, function(count, price) {
      values.push({x: parseInt(price, 10), y: count, size: count});
    });
    var data = $scope.exampleData.filter(function(d) { return d.key === key; });
    if(data.length) {
      data[0].values = values;
    }
    else {
      $scope.exampleData.push({
        key: key,
        color: colorForKey[key],
        values: values
      });
    }
    angular.element($window).trigger('resize');
  }
  $scope.xFunction = function(){
    return function(d){
      return Math.sqrt(d.x);
    };
  };
  $scope.xAxisTickFormatFunction = function() {
    return function(d) {
      return Math.round(d * d);
    };
  };
  $scope.yFunction = function(){
    return function(d){
      return Math.sqrt(d.y);
    };
  };
  $scope.yAxisTickFormatFunction = function() {
    return function(d) {
      return Math.round(d * d);
    };
  };

  $scope.exampleData = [];

  // $scope.xAxisTickFormatFunction = function(){
  //   return function(d){
  //     return d3.time.format('%x')(new Date(d));  //uncomment for date format
  //   };
  // };


});
