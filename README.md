# Rental Map

A map created and used in early 2014 to find a flat in Zurich.

Demo: http://t.preus.se/rental-map/#/

## Develop

Dependencies: `node.js`, `bower`, `grunt`

```bash
npm install
bower install
grunt serve
```

The application was developed with the philosophy of writing as little code as possible
and simply relaying on libraries and ready made components.
It was created for my own flat hunt in Zurich and is not meant as ready made application for consumers.

## Data

`comparis_fetcher.js` is a crawler for fetching data about rentals from [comparis.ch](https://www.comparis.ch/immobilien/).

The area can be defined by creating a `data/clusters.json` file in following format:
```json
[
  {
    "LowerLeftLat": 47.3100548886702,
    "LowerLeftLng": 8.422644311746353,
    "UpperRightLat": 47.429105601447496,
    "UpperRightLng": 8.63893764670729
  }
]
```
*Example is the bounding box of Zurich.*

Subclusters within given clusters, which are needed to fetch all objects, are added automatically by running `grunt comparis:fetch_clusters`.

The crawler can be used with following grunt tasks:
```bash
grunt comparis:fetch_clusters # fetches subclusters and object ids, might need to run twice after manual `cluster.json` modifications
grunt comparis:fetch_details # gets details for all object ids
grunt comparis:geo_json # generates geo json file for app
```

Run all those tasks in given sequence to retrieve and generate a file that can be used by the application.
