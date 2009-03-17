/*
 * @name KMLMManager
 * @version 0.1
 * @copyright (c) 2009 Dario Bigongiari
 * @author Dario Bigongiari
 * @depends markermanager.js
 *
 * ------------------------------------------------------------------------------
 * The MIT License
 *
 * Copyright (c) 2009 Dario Bigongiari (dario.bigongiari@gmail.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 * ------------------------------------------------------------------------------
 *
 *
 * The KMLMManager object makes it possible to use MarkerManager (v1.1) with public KML files, such
 * as "my maps" files. Markers are added to the manager only when first needed (depending on the
 * zoomLevel) and cached to speed up reloading. KML files have to be divided by zoom level. Each
 * file will be loaded only when the MarkerManager actually needs it. Files can also be prefetched
 * (see implementation below). Make sure the MarkerManager and GMaps js files have been loaded
 * before using this class.
 *
 * You can find the MarkerManager here:
 *  http://gmaps-utility-library.googlecode.com/svn/trunk/markermanager/
 *
 * NOTICE: Internally a GGeoXml object is used to load kml files freeing the user from the same
 * origin policy of most browsers. This also means this library depends on a private GMaps
 * interface that could be changed with any new API release. The current release (and the only that
 * I have tested) is v2.149. You can specify the api version using the google ajax loader:
 *  google.load("maps", "2.149");
 * or trough the script url:
 *   http://maps.google.com/maps?file=api&amp;v=2.149&amp;key=__YOUR_KEY_HERE__
 * To support a new version of the GMaps API you could try to adapt the extractMarkers function to 
 * the new internal structure of the GGeoXml object. 
 *
 *
 * Usage example:
 *
 *  <html>
 *   <head>
 *     <script src="http://maps.google.com/maps?file=api&amp;v=2.149&amp;key=__YOUR_KEY_HERE__" type="text/javascript"></script>
 *   <script type="text/javascript" charset="utf-8" src="./markermanager.js"></script>
 *   <script type="text/javascript" charset="utf-8" src="./KMLMManager.js"></script>
 *   </head>
 *   <body>
 *     <div id="map"></div>
 *     <script type="text/javascript">
 *       var map=new GMap2(document.getElementById("map"));
 *       map.setCenter(new GLatLng(43.000000, 11.100000), 9);
 *
 *       var kmlFiles = { low: ["http://yourhost.com/1.kml", "http://yourhost.com/2.kml"],
 *                         high: ["http://yourhost.com/3.kml"] };
 *       var zoomLevels = { low: 15, high: 8 };
 *
 *       // Create the manager object and show markers...
 *       manager = new KMLMManager(map, kmlFiles, zoomLevels);
 *       manager.show();
 *     </script>
 *   </body>
 *  </html>
 *
 */

function KMLMManager(map, kmlFiles, zoomLevels, prefetchZoom, managerOptions) {
  // KMLMManager should be always instanciated using the "new" keyword.
  //   map: is a GMap2 object (tested only with version 2.149, see above).
  //   kmlFiles: is a flat object containing kml urls divided by labels.
  //   zoomLevels: is a flat object containing the minimum zoomLevel for each kmlFiles label.
  //   prefetchZoom: is an integer used to trigger prefetching of kml files before their actual
  //                 zoomLevel (default: 2).
  //   managerOptions: are the options to be passed to the MarkerManager object upon construction
  //                   (default: {}).

  // Registers an handler to update the MarkerManager and shows all the markers.
  // If prefetch array is specified, all the labels contained in the array are prefetched for faster
  // display.
  this.show = function(prefetch) {
    if (prefetch) {
      for (var i=0; i < prefetch.length; ++i) {
        fetchLevel(prefetch[i]);
      }
    }

    listener = GEvent.addListener(map, "zoomend", loadOverlays);
    GEvent.trigger(map, "zoomend", map.getZoom());
    manager.show();
  }

  // Hidea all the markers and prevent further loading.
  this.hide = function() {
    if (listener) { GEvent.removeListener(listener); }
    manager.hide();
  }

  // Removes all markers from the manager. Markers are still cached.
  // If shouldRefresh is true it will also refresh the manager afterwards.
  this.removeAll = function(shouldRefresh) {
    for (label in zoomLevels) {
      this.removeZoomLevel(label, false);
    }

    if (shouldRefresh) { manager.refresh(); }
  }

  // Removes all markers associated with a zoomLevel from the MarkerManager.
  // Markers are still cached.
  // If shouldRefresh is true it will also refresh the manager afterwards.
  this.removeZoomLevel = function(label, shouldRefresh) {
    if (!zoomLevels[label]) { return; }

    var len = zoomLevels[label];
    var i = 0;
    // remove points from the manager.
    while(i < len) {
      this.removeOverlay(zoomLevels[label][i], false);
      ++i;
    }

    if (shouldRefresh) { manager.refresh(); }
  }

  // Removes all the markers associated to a particular kml file from the managers and refreshes
  // the manger upon completion. Does not remove the overlay from cache.
  this.removeOverlay = function(url, shouldRefresh) {
    if (!isLoaded[url] || !kmlCache[url]) { return; }

    var len = kmlCache[url];
    var i = 0;

    // remove points from the manager.
    while(i < len) {
      manager.removeMarker(markers[i]);
      ++i;
    }

    isLoaded[url] = false;

    if (shouldRefresh) { manager.refresh(); }
  };


  // "Private" stuff, you should not worry about these unless you want to modify the behaviours.
  prefetchZoom = 2 || prefetchZoom;                      // zoom offset
  var kmlCache = {};                                     // contains all markers by url
  var isLoaded = {};                                     // used to tell if a particular file has
                                                         // been loaded by the manager
  var listener = null;                                   // handler to the "zoomend" event
  var loadingOverlay = {nbr: 0};                         // "semaphore" used to trigger
                                                         // manager.refresh()
  managerOptions = managerOptions || {};
  var manager = new MarkerManager(map, managerOptions);

  // Decides what to load based on the current zoomlevel (newLevel).
  // If triggered without a newLevel it assumes the map has never been zoomed before and loads the
  // overlays. Once loaded a kml is cached to reduce bandwidth usage.
  function loadOverlays(oldLevel, newLevel) {
    // force loading if the newLevel is not set
    newLevel = newLevel || oldLevel;
    if (oldLevel > newLevel) { return; }

    // Force loading of files based on the prefetchZoom option.
    newLevel += prefetchZoom;

    // load kml files and add markers to the manager based to the current zoomLevel
    var level, url;
    for (var key in zoomLevels) {
      level = zoomLevels[key];
      if (newLevel >= level) {
        fetchLevel(key);
      }
    }
  }

  // Fetches an entire level. If zoomLevel is not specified uses default value.
  function fetchLevel(label, zoomLevel) {
    zoomLevel = zoomLevel || zoomLevels[label];
    var files = kmlFiles[label];
    for (var j in files) {
      getOverlay(files[j], zoomLevel);
    }
  }

  // Adds a new overlay to the map specified trough its url.
  // minZoom is the minimum zoom the markers will be displayed at.
  // The markers are cached and the manager refresh is triggered only after all urls have been
  // loaded.
  function getOverlay(url, minZoom) {
    if (isLoaded[url]) { return; }

    if (kmlCache[url]) {
      manager.addMarkers(kmlCache[url], minZoom);
      if (done(url) < 1) {
        manager.refresh();
      };
      isLoaded[url] = true;
      return;
    }

    // halts if already loading.
    if (!loading(url)) { return; }

    var xml = new GGeoXml(url);

    GEvent.addListener(xml, "load", function() {
      this.extractMarkers = extractMarkers; 
      kmlCache[url] = this.extractMarkers(); // on load error this is an empty array.
      getOverlay(url, minZoom);
    });
  };

  // This function is applyed to the GGeoXml to access the internl markers array. 
  function extractMarkers() {
    // console.log(this);
    if (this.hc) {
      return this.hc;  // 2.149
    } else {
      return this.Yb;  // 2.148
    }
  }

  // Used to prevent multiple loading of the same file.
  // It should be called when initiating a file request.
  function loading(url) {
    if (loadingOverlay[url]) { return false; }

    loadingOverlay[url] = true;
    loadingOverlay['nbr'] += 1;
    return true;
  }

  // Used to prevent multiple loading of the same file.
  // It should be called at the end of a file request.
  function done(url) {
    loadingOverlay[url] = true;
    var nbr = loadingOverlay['nbr'] -1;
    if (nbr < 0) { nbr = 0; }
    loadingOverlay['nbr'] = nbr;

    return nbr;
  }
}
