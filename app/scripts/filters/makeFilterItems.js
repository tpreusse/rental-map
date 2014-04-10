'use strict';

var filters = angular.module('flatApp.filters', []);

filters.filter('makeFilterItems', function() {

    return function(items, filterOn, checked, removeNulls) {

        if (filterOn === false) {
            return items;
        }

        if ((filterOn || angular.isUndefined(filterOn)) && angular.isArray(items)) {
            var filterItems = {};
            if(angular.isString(checked)) {
                checked = checked.split(',');
            }
            if(angular.isArray(checked)) {
                filterItems.check = {};
                angular.forEach(checked, function(value) {
                    if(value.length) {
                        filterItems.check[value] = true;
                    }
                });
            }
            else {
                filterItems.check = checked || {};
            }
            filterItems.list = [];

            var extractValueToCompare = function(item) {
                if (angular.isObject(item) && angular.isString(filterOn)) {
                    return item[filterOn];
                } else {
                    return item;
                }
            };

            angular.forEach(items, function(item) {
                var duplicate = false;

                for (var i = 0; i < filterItems.list.length; i++) {
                    if (angular.equals(filterItems.list[i].name, extractValueToCompare(item))) {
                        duplicate = filterItems.list[i];
                        break;
                    }
                }

                var value = item[filterOn];
                if (value || !removeNulls) {
                    if (!angular.isDefined(filterItems.check[value])) {
                        filterItems.check[value] = !angular.isDefined(checked);
                    }
                }
                if (removeNulls) {
                    if (value) {
                        if (!duplicate) {
                            filterItems.list.push({name: value, count: 1});
                        }
                        else {
                            duplicate.count++;
                        }
                    }
                } else {
                    if (!duplicate) {
                        filterItems.list.push({name: value, count: 1});
                    }
                    else {
                        duplicate.count++;
                    }
                }

            });

            filterItems.list.sort(function(a, b) {
                return b.count - a.count;
            });

            return filterItems;
        }
    };
});