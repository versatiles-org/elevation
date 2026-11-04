import { Map, NavigationControl, ScaleControl } from '/maplibre/maplibre-gl.mjs';

const BASEMAP_STYLE = 'https://tiles.versatiles.org/assets/styles/colorful/style.json';

// Both containers are 512px tiles up to Mapterhorn's highest zoom level.
const TILE_SIZE = 512;
const MAX_ZOOM = 12;

const tiles = (name) => [`${location.origin}/tiles/${name}/{z}/{x}/{y}`];

const map = new Map({
	container: 'map',
	style: BASEMAP_STYLE,
	center: [9.5, 46.5],
	zoom: 7,
	hash: true,
	maxPitch: 85,
});
map.addControl(new NavigationControl({ visualizePitch: true }));
map.addControl(new ScaleControl());

map.on('load', () => {
	const basemapLayers = map.getStyle().layers.map((layer) => layer.id);
	// Lay the shading over the ground but under roads' labels and place names.
	const firstSymbol = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;

	map.addSource('hillshade', { type: 'raster', tiles: tiles('hillshade'), tileSize: TILE_SIZE, maxzoom: MAX_ZOOM });
	map.addLayer({ id: 'hillshade', type: 'raster', source: 'hillshade' }, firstSymbol);

	// MapLibre recommends separate sources for its hillshade and for terrain.
	const dem = {
		type: 'raster-dem',
		encoding: 'terrarium',
		tiles: tiles('elevation'),
		tileSize: TILE_SIZE,
		maxzoom: MAX_ZOOM,
	};
	map.addSource('elevation-hillshade', dem);
	map.addSource('elevation-terrain', dem);
	map.addLayer(
		{ id: 'native', type: 'hillshade', source: 'elevation-hillshade', layout: { visibility: 'none' } },
		firstSymbol,
	);

	const panel = document.getElementById('panel');
	const apply = () => {
		const on = (name) => panel.elements.namedItem(name).checked;
		const visibility = (visible) => (visible ? 'visible' : 'none');
		for (const id of basemapLayers) map.setLayoutProperty(id, 'visibility', visibility(on('basemap')));
		map.setLayoutProperty('hillshade', 'visibility', visibility(on('hillshade')));
		map.setLayoutProperty('native', 'visibility', visibility(on('native')));
		map.setTerrain(on('terrain') ? { source: 'elevation-terrain', exaggeration: 1 } : null);
	};
	panel.addEventListener('change', apply);
	apply();
});
