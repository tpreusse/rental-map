'use strict';

angular.module('flatApp')
.controller('MainCtrl', function($scope, $http, $filter, $location, $window, localStorage) {
  var makeFilterItems = $filter('makeFilterItems');
  var initialSearchQuery = angular.copy($location.search());
  var defaultQuery = {
    days: 30,
    type: 'Wohnung,Dachwohnung,Maisonette,Einzelzimmer,Attika,Loft,WG-Zimmer,Studio,Doppeleinfamilienhaus,Bauernhaus,Reihenhaus,Villa,Terrassenwohnung'
  };
  Object.keys(defaultQuery).forEach(function(key) {
    if (initialSearchQuery[key] === undefined) {
      initialSearchQuery[key] = defaultQuery[key];
    }
  });

  $scope.select = function(object, selection) {
    object.selection = selection;
    if(object.found === undefined) {
      object.found = true;
    }
    var fav = _.find($scope.selection, function(f) {
      return f.id === object.id;
    });
    if(!fav) {
      $scope.selection.push(object);
    }
    $scope.apply();
  };
  $scope.release = function(object) {
    _.remove($scope.selection, function(f) {
      return f.id === object.id;
    });
    $scope.goneObjects = $filter('filter')($scope.selection, {found: false});
    $scope.apply();
  };
  $scope.$watchCollection('selection', function(value, old) {
    if(!value && !old) {
      // before selection is initiated
      return;
    }
    localStorage.selection = angular.toJson(value);

    $scope.selectionFilter = makeFilterItems(
      $scope.objects,
      "selection",
      $scope.selectionFilter ? $scope.selectionFilter.check : initialSearchQuery.selection,
      false
    );
    filterObjects();
  });

  $scope.comment = function($event, id) {
    $event.preventDefault();

    var fav = _.find($scope.selection, function(f) {
      return f.id === id;
    });
    if(!fav) {
      $window.alert('can\'t comment on that');
    }
    var comment = $($event.target).val();
    fav.comments = fav.comments || [];
    fav.comments.push(comment);
  };
  $scope.saveSelection = function($event) {
    $event.preventDefault();
    var blob = new Blob([angular.toJson($scope.selection, true)], {type: "application/json;charset=utf-8"});
    $window.saveAs(blob, "selection.json");
  };
  $scope.onFileSelect = function($files) {
    var fileReader = new FileReader();
    fileReader.onload = function(event) {
      readSelection(event.target.result);
      $scope.$apply();
    };
    for (var i = 0; i < $files.length; i++) {
      var file = $files[i];
      fileReader.readAsText(file);
    }
  };

  var readSelection = function(string) {
    $scope.selection = angular.fromJson(string || '[]');
    angular.forEach($scope.selection, function(s) {
      s.found = undefined;
    });

    $scope.objects = $scope.objects.map(function(o) {
      var fav = _.find($scope.selection, function(f) {
        return f.id === o.id;
      });
      if(fav) {
        var ignoredKeys = ['history', 'found', 'selection', 'comments'];
        if(!angular.equals(_.omit(o, ignoredKeys), _.omit(fav, ignoredKeys))) {
          o.history = (fav.history || []);
          o.history.push(_.omit(fav, 'history'));
          o.selection = fav.selection;
          o.comments = fav.comments;

          _.remove($scope.selection, fav);
          $scope.selection.push(o);
        }
        else {
          o = fav;
        }
        o.found = true;
      }
      else {
        o.found = undefined;
        o.history = undefined;
        o.selection = undefined;
        o.comments = undefined;
      }
      return o;
    });

    angular.forEach($scope.selection, function(s) {
      s.found = !!s.found;
    });
    $scope.goneObjects = $filter('filter')($scope.selection, {found: false});
  };

  var updateTimeFormat = d3.time.format('%B %e %Y, %-I&nbsp;%p');
  var dataRequest = $http.get('geojson.json').success(function(data){
    $scope.updateDate = updateTimeFormat(new Date(data.properties.update));
    var time = (new Date()).getTime();
    $scope.objects = data.features.map(function(o) {
      var simple = o.properties;
      simple.id = simple.source + simple.source_id;
      simple.lat = o.geometry.coordinates[1];
      simple.lng = o.geometry.coordinates[0];
      var create_date = new Date(o.properties.create_date);
      var age = (time - create_date.getTime());
      age /= 1000 * 60 * 60 * 24;
      simple.days = age = Math.ceil(Math.abs(age));
      if (age > 14) {
        simple.age = Math.ceil(age / 7) + ' weeks';
      } else if (age === 1) {
        simple.age = 'one day';
      } else {
        simple.age = age + ' days';
      }

      return simple;
    });
    readSelection(localStorage.selection);
    $scope.filter = makeFilterItems($scope.objects, "rental_type", initialSearchQuery.type, true);
    $scope.selectionFilterNames = {
      "0": "Nope",
      "1": "Maybe",
      "2": "Yes",
      "undefined": "TBD"
    };
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
    if($scope.selectionFilter) {
      objects = $filter('filter')(objects, function(item) {
        return $scope.selectionFilter.check[String(item.selection)];
      });
    }
    objects = $filter('filter')(objects, $scope.filterByRentalType);
    objects = $filter('filter')(objects, function(item) {
      var pass = true;
      if(item.days && item.days > $scope.daysMax) {
        pass = false;
      }
      if(item.rooms && $scope.roomMin && item.rooms < $scope.roomMin) {
        pass = false;
      }
      if(item.price < ($scope.priceMin || 0) && item.price !== 0) {
        pass = false;
      }
      if($scope.priceMax && item.price > $scope.priceMax) {
        pass = false;
      }
      return pass;
    });
    objects = $filter('orderBy')(objects, 'price');
    objects = $filter('orderBy')(objects, 'selection', true);
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

      $scope.roomData = [];
      var minRoom = d3.min($scope.filteredObjects, function(d) { return d.rooms; }),
          maxRoom = d3.max($scope.filteredObjects, function(d) { return d.rooms; });
      var maxDays = d3.max($scope.filteredObjects, function(d) { return d.days; });

      angular.forEach($scope.filter.list, function(item) {
        var objects = [];
        if(item.count) {
          objects = $scope.filteredObjects.filter(function(o) { return o.rental_type === item.name; });
        }
        generatePriceData(item.name, objects);
        generateRoomData(item.name, objects, minRoom, maxRoom);
        generateAgeData(item.name, objects, maxDays);
        angular.element($window).trigger('resize');
      });
    }
  });
  $scope.$watch('currentPage + numPerPage', function() {
    $location.search('p', $scope.currentPage).replace();
    paginateObjects();
  });

  $scope.$watchCollection('objects', function() {
    if(!$scope.objects) { return; }
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
  $scope.$watchCollection('selectionFilter.check', function() {
    if(!$scope.selectionFilter) { return; }
    var checked = [];
    angular.forEach($scope.selectionFilter.check, function(value, key) {
      if(value) {
        checked.push(key);
      }
    });
    $location.search('selection', checked.join(',')).replace();
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
  $scope.roomMin = initialSearchQuery.room;
  $scope.daysMax = initialSearchQuery.days;
  $scope.$watch('priceMin + priceMax + roomMin + daysMax', function(value, old) {
    if(value === old) { return; }

    $location
      .search('min', $scope.priceMin)
      .search('max', $scope.priceMax)
      .search('room', $scope.roomMin)
      .search('days', $scope.daysMax)
      .replace();

    filterObjects();
  });

  window.$d = $scope;

  $scope.typeScale = d3.scale.category20().domain(['Wohnung', 'Gewerbeobjekt', 'Parkplatz', 'Tiefgarage', 'Möblierte Wohnung', 'WG-Zimmer', 'Attika', 'Maisonette', 'Dachwohnung', 'Diverses', 'Einfamilienhaus', 'Loft', 'Einzelzimmer', 'Reiheneinfamilienhaus', 'Studio', 'Einzelgarage', 'Doppeleinfamilienhaus', 'Villa', 'Bastelraum', 'Terrassenwohnung']);

  $scope.priceData = [];

  function generatePriceData(key, objects) {
    var data = $scope.priceData.filter(function(d) { return d.key === key; })[0];
    if(angular.equals(objects, [])) {
      if(data) {
        _.remove($scope.priceData, data);
      }
      return;
    }
    var counters = {};
    objects.forEach(function(objects) {
      if(!objects.price) { return; }
      var price = String(Math.round(parseInt(objects.price, 10) / 100) * 100);
      counters[price] = (counters[price] || 0) + 1;
    });
    var values = [];
    angular.forEach(counters, function(count, price) {
      values.push({x: parseInt(price, 10), y: count, size: count});
    });
    if(data) {
      data.values = values;
    }
    else {
      $scope.priceData.push({
        key: key,
        color: $scope.typeScale(key),
        values: values
      });
    }
  }
  $scope.xFunction = function(){
    return function(d){
      return d.x;
    };
  };
  $scope.xAxisTickFormatFunction = function() {
    return function(d) {
      return Math.round(d);
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

  // $scope.xAxisTickFormatFunction = function(){
  //   return function(d){
  //     return d3.time.format('%x')(new Date(d));  //uncomment for date format
  //   };
  // };


  // room
  $scope.roomData = [];
  function generateRoomData(key, objects, minRoom, maxRoom) {
    var data = $scope.roomData.filter(function(d) { return d.key === key; })[0];
    if(angular.equals(objects, [])) {
      if(data) {
        _.remove($scope.roomData, function(d) { return d.key === key; });
      }
      return;
    }
    var counters = {};
    objects.forEach(function(objects) {
      if(!objects.rooms) { return; }
      counters[objects.rooms] = (counters[objects.rooms] || 0) + 1;
    });
    var values = [], i;
    for(i = minRoom; i <= maxRoom; i += 0.5) {
      values.push([i, counters[String(i)] || 0]);
    }

    if(data) {
      data.values = values;
    }
    else {
      $scope.roomData.push({
        key: key,
        color: $scope.typeScale(key),
        values: values
      });
    }
  }

  $scope.roundYAxisTickFormatFunction = function() {
    return function(d) {
      return Math.round(d);
    };
  };

  // age
  $scope.ageData = [];
  function generateAgeData(key, objects, maxDays) {
    var data = $scope.ageData.filter(function(d) { return d.key === key; })[0];
    if(angular.equals(objects, [])) {
      if(data) {
        _.remove($scope.ageData, function(d) { return d.key === key; });
      }
      return;
    }
    var counters = {};
    objects.forEach(function(objects) {
      if(!objects.days) { return; }
      counters[objects.days] = (counters[objects.days] || 0) + 1;
    });
    var values = [], i;
    for(i = 0; i <= maxDays; i += 1) {
      values.push([i, counters[String(i)] || 0]);
    }

    if(data) {
      data.values = values;
    }
    else {
      $scope.ageData.push({
        key: key,
        color: $scope.typeScale(key),
        values: values
      });
    }
  }

});
