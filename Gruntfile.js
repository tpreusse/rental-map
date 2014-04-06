module.exports = function(grunt) {

    var comparis = require('./comparis_fetcher.js');

    // A very basic default task.
    grunt.registerTask('default', 'Log some stuff.', function() {
        grunt.log.write('Logging some stuff...').ok();
    });
    grunt.registerTask('comparis:fetch_clusters', 'Get all active ads from comparis', function() {
        var done = this.async();
        comparis.fetchClusters().then(function() {
            done();
        });
    });
    grunt.registerTask('comparis:fetch_details', 'Get detail json for all ads', function() {
        var done = this.async();
        comparis.fetchDetails().then(function() {
            done();
        });
    });

};