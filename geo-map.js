/* Geographic route map: OpenStreetMap tiles and Web Mercator coordinates. */
const geoMapInstances = new WeakMap();
const GEO_TILE_SIZE = 256;
const GEO_MIN_ZOOM = 4;
const GEO_MAX_ZOOM = 17;

function geoPoint(place) {
  const lat = Number(place?.geo?.lat);
  const lng = Number(place?.geo?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85.0511
    ? { lat, lng } : null;
}

function geoWorld(point, zoom) {
  const scale = GEO_TILE_SIZE * 2 ** zoom;
  const radians = point.lat * Math.PI / 180;
  return {
    x: (point.lng + 180) / 360 * scale,
    y: (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * scale
  };
}

function geoUnproject(x, y, zoom) {
  const scale = GEO_TILE_SIZE * 2 ** zoom;
  return { lng: x / scale * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI };
}

function geoMapMarkup(source, route, expanded = false) {
  const day = route?.day || 0;
  const title = route ? `${state.data.days.find((item) => item.day === day)?.date || ""} 地图` : "俄罗斯双城地图";
  return `<div class="travel-map-block geo-map-block ${expanded ? "is-expanded" : ""}">
    <div class="geo-map" data-geo-region="${escapeHtml(source.id)}" data-geo-day="${day}" role="region" aria-label="${escapeHtml(title)}，可拖动、缩放">
      <div class="geo-map-tiles" aria-hidden="true"></div>
      <svg class="geo-map-routes" aria-hidden="true"></svg>
      <div class="geo-map-markers"></div>
      <div class="geo-map-controls"><button type="button" data-geo-zoom="in" aria-label="放大地图">+</button><button type="button" data-geo-zoom="out" aria-label="缩小地图">−</button></div>
      <div class="geo-map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a></div>
      <div class="geo-map-error" hidden>底图暂时无法加载。<a href="https://www.openstreetmap.org/" target="_blank" rel="noopener noreferrer">打开 OpenStreetMap ↗</a></div>
    </div>
    <div class="map-utility"><span>真实地理底图与地点位置 · 彩色直线仅表示游览顺序，非实际行车或步行路线</span>${expanded ? "" : `<button type="button" data-expand-geo-map="${escapeHtml(source.id)}" data-expand-geo-day="${day}">放大 ↗</button>`}</div>
  </div>`;
}

function initializeGeoMaps(root = document) {
  root.querySelectorAll(".geo-map").forEach((element) => {
    if (geoMapInstances.has(element)) return;
    const source = travelMapSource(state.data.routeMap, element.dataset.geoRegion);
    const day = Number(element.dataset.geoDay);
    const placeById = new Map(state.data.map.places.filter((place) => geoPoint(place)).map((place) => [place.id, place]));
    const allRoutes = (source.routes || []).map((route) => ({
      day: route.day, color: route.color || MAP_ROUTE_PALETTE[(route.day - 1) % MAP_ROUTE_PALETTE.length],
      places: (route.placeIds || []).map((id) => placeById.get(id)).filter(Boolean)
    }));
    const routes = day ? allRoutes.filter((route) => route.day === day) : allRoutes;
    const visiblePlaces = day
      ? [...new Map(routes.flatMap((route) => route.places).map((place) => [place.id, place])).values()]
      : [...placeById.values()];
    const focusPlaces = visiblePlaces.length ? visiblePlaces : [...placeById.values()];
    const tiles = element.querySelector(".geo-map-tiles");
    const svg = element.querySelector(".geo-map-routes");
    const markers = element.querySelector(".geo-map-markers");
    const error = element.querySelector(".geo-map-error");
    const map = { element, zoom: 6, center: { lat: 57.8, lng: 34.1 }, tiles, svg, markers, error, routes, visiblePlaces, source, day, loaded: false, failed: 0 };
    geoMapInstances.set(element, map);

    function fit() {
      const width = element.clientWidth || 360;
      const height = element.clientHeight || 350;
      const points = focusPlaces.map((place) => geoWorld(geoPoint(place), 0));
      if (!points.length) return;
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));
      const allowedX = Math.max(1, width - 110);
      const allowedY = Math.max(1, height - 100);
      const span = Math.max((maxX - minX) / allowedX, (maxY - minY) / allowedY, 1 / 2 ** 14);
      map.zoom = Math.max(GEO_MIN_ZOOM, Math.min(14, Math.floor(Math.log2(1 / span))));
      map.center = geoUnproject((minX + maxX) / 2, (minY + maxY) / 2, 0);
      draw();
    }

    function pixel(place, center, width, height) {
      const point = geoWorld(geoPoint(place), map.zoom);
      return { x: point.x - center.x + width / 2, y: point.y - center.y + height / 2 };
    }

    function draw() {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      const center = geoWorld(map.center, map.zoom);
      const worldTiles = 2 ** map.zoom;
      const firstX = Math.floor((center.x - width / 2) / GEO_TILE_SIZE);
      const lastX = Math.floor((center.x + width / 2) / GEO_TILE_SIZE);
      const firstY = Math.floor((center.y - height / 2) / GEO_TILE_SIZE);
      const lastY = Math.floor((center.y + height / 2) / GEO_TILE_SIZE);
      const needed = new Set();
      for (let x = firstX; x <= lastX; x++) for (let y = firstY; y <= lastY; y++) {
        if (y < 0 || y >= worldTiles) continue;
        const key = `${map.zoom}/${x}/${y}`;
        needed.add(key);
        let image = [...tiles.children].find((item) => item.dataset.key === key);
        if (!image) {
          image = document.createElement("img");
          image.dataset.key = key;
          image.alt = "";
          image.draggable = false;
          const tilePath = `${map.zoom}/${((x % worldTiles) + worldTiles) % worldTiles}/${y}.png`;
          image.dataset.tilePath = tilePath;
          image.src = `https://tile.openstreetmap.org/${tilePath}`;
          image.addEventListener("load", () => { map.loaded = true; error.hidden = true; });
          image.addEventListener("error", () => {
            if (image.dataset.fallback !== "de") {
              image.dataset.fallback = "de";
              image.src = `https://tile.openstreetmap.de/${image.dataset.tilePath}`;
              return;
            }
            if (!map.loaded && ++map.failed >= 2) error.hidden = false;
          });
          tiles.append(image);
        }
        image.style.left = `${x * GEO_TILE_SIZE - center.x + width / 2}px`;
        image.style.top = `${y * GEO_TILE_SIZE - center.y + height / 2}px`;
      }
      [...tiles.children].forEach((image) => { if (!needed.has(image.dataset.key)) image.remove(); });
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("width", width);
      svg.setAttribute("height", height);
      svg.replaceChildren();
      for (const route of routes) {
        if (route.places.length < 2) continue;
        const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        polyline.setAttribute("points", route.places.map((place) => { const p = pixel(place, center, width, height); return `${p.x},${p.y}`; }).join(" "));
        polyline.setAttribute("stroke", route.color);
        polyline.setAttribute("class", "geo-route-line");
        svg.append(polyline);
      }
      markers.replaceChildren();
      for (const place of visiblePlaces) {
        const p = pixel(place, center, width, height);
        if (p.x < -90 || p.x > width + 90 || p.y < -50 || p.y > height + 50) continue;
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = `geo-map-marker${!day && map.zoom < 10 && !["moscow", "petersburg", "svo", "peterhof", "pushkin"].includes(place.id) ? " is-small" : ""}`;
        marker.style.left = `${p.x}px`;
        marker.style.top = `${p.y}px`;
        marker.dataset.placeId = place.id;
        marker.dataset.mapRegion = source.id;
        marker.dataset.placeRole = day ? "当天地点" : "行程地点";
        marker.setAttribute("aria-label", `${place.nameZh || place.name || place.id}，打开地点地图`);
        marker.setAttribute("aria-haspopup", "dialog");
        marker.innerHTML = `<span class="geo-marker-dot"></span><span class="geo-marker-label">${escapeHtml(place.nameZh || place.name || place.id)}</span>`;
        markers.append(marker);
      }
    }

    function changeZoom(delta) {
      map.zoom = Math.max(GEO_MIN_ZOOM, Math.min(GEO_MAX_ZOOM, map.zoom + delta));
      draw();
    }

    element.querySelectorAll("[data-geo-zoom]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      changeZoom(button.dataset.geoZoom === "in" ? 1 : -1);
    }));
    let drag = null;
    element.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, a")) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, center: geoWorld(map.center, map.zoom) };
      element.setPointerCapture(event.pointerId);
    });
    element.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      map.center = geoUnproject(drag.center.x - (event.clientX - drag.x), drag.center.y - (event.clientY - drag.y), map.zoom);
      draw();
    });
    element.addEventListener("pointerup", () => { drag = null; });
    element.addEventListener("pointercancel", () => { drag = null; });
    element.addEventListener("wheel", (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    const observer = new ResizeObserver(() => { if (element.clientWidth) draw(); });
    observer.observe(element);
    fit();
  });
}
