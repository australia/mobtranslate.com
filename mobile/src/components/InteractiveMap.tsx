import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { MAP_STYLE_URL } from '../lib/mapConfig';

export interface MapMarker { lng: number; lat: number; label?: string; kind?: 'lang' | 'place' | 'town' }
export interface InteractiveMapHandle { flyTo: (lng: number, lat: number, zoom?: number) => void }

/** Pan/zoom watercolour map (MapLibre GL JS + MapTiler "aquarelle") in a WebView.
 *  Place markers show their name as a label once zoomed in (hidden at region zoom
 *  to avoid clutter). Tapping a marker recenters + notifies RN. Imperative
 *  `flyTo` lets the parent recenter the (mounted) map from a list tap. */
export const InteractiveMap = forwardRef<InteractiveMapHandle, {
  markers: MapMarker[];
  center?: [number, number];
  zoom?: number;
  fit?: boolean;
  onSelect?: (label: string) => void;
}>(function InteractiveMap({ markers, center, zoom, fit, onSelect }, ref) {
  const webRef = useRef<WebView>(null);

  useImperativeHandle(ref, () => ({
    flyTo: (lng, lat, z = 11) => {
      webRef.current?.injectJavaScript(
        `window.__map && window.__map.flyTo({center:[${lng},${lat}],zoom:${z},duration:650}); true;`,
      );
    },
  }), []);

  const html = useMemo(() => {
    const data = JSON.stringify(markers.filter((m) => isFinite(m.lng) && isFinite(m.lat)));
    const style = JSON.stringify(MAP_STYLE_URL);
    const c = center ? `[${center[0]},${center[1]}]` : '[134,-25]';
    const z = zoom ?? 2.7;
    const doFit = fit ? 'true' : 'false';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet"/>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>html,body,#map{margin:0;height:100%;background:#EAF0E4;overflow:hidden}
.mk{display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateY(-50%)}
.dot{width:18px;height:18px;border-radius:50%;background:#B0673B;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}
.mk.lang .dot{width:24px;height:24px;background:#324E3B}
.lbl{display:none;margin-top:3px;padding:1px 6px;background:rgba(255,255,255,.92);border-radius:6px;font:600 11px/1.2 -apple-system,system-ui,sans-serif;color:#26302A;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.18);max-width:120px;overflow:hidden;text-overflow:ellipsis}
.mk.lang .lbl{display:block;font-weight:700}
.zoomed .mk.place .lbl{display:block}
/* reference towns: small grey tick + always-on label, never compete with place pins */
.mk.town{transform:translateY(-50%);pointer-events:none}
.mk.town .dot{width:7px;height:7px;border-radius:50%;background:#7C8A79;border:1.5px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.25)}
.mk.town .lbl{display:block;margin-top:2px;padding:0 4px;background:transparent;box-shadow:none;font:600 10px/1.2 -apple-system,system-ui,sans-serif;color:#5C6A59;text-shadow:0 1px 2px #EAF0E4,0 0 3px #EAF0E4}</style>
</head><body><div id="map"></div><script>
var pts=${data};
var map=new maplibregl.Map({container:'map',style:${style},center:${c},zoom:${z},attributionControl:false,dragRotate:false,pitchWithRotate:false});
window.__map=map;
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
map.touchZoomRotate.disableRotation();
function setZoomClass(){document.body.classList.toggle('zoomed',map.getZoom()>=8.5);}
map.on('zoom',setZoomClass);
map.on('load',function(){
 setZoomClass();
 var b=new maplibregl.LngLatBounds();
 pts.forEach(function(p){
  var kind=p.kind==='lang'?'lang':(p.kind==='town'?'town':'place');
  var el=document.createElement('div');el.className='mk '+kind;
  var dot=document.createElement('div');dot.className='dot';el.appendChild(dot);
  if(p.label){var l=document.createElement('div');l.className='lbl';l.textContent=p.label;el.appendChild(l);}
  var mk=new maplibregl.Marker({element:el,anchor:'top'}).setLngLat([p.lng,p.lat]);
  if(p.label&&kind!=='town'){el.addEventListener('click',function(ev){ev.stopPropagation();map.flyTo({center:[p.lng,p.lat],zoom:Math.max(map.getZoom(),11),duration:600});window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(p.label);});}
  mk.addTo(map); if(kind!=='town') b.extend([p.lng,p.lat]);
 });
 if(${doFit} && pts.length>1){try{map.fitBounds(b,{padding:60,maxZoom:8,duration:0});}catch(e){}}
});
</script></body></html>`;
  }, [markers, center, zoom, fit]);

  return (
    <WebView
      ref={webRef}
      originWhitelist={['*']}
      source={{ html }}
      style={{ flex: 1, backgroundColor: '#EAF0E4' }}
      onMessage={(e) => onSelect?.(e.nativeEvent.data)}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      nestedScrollEnabled
      overScrollMode="never"
    />
  );
});
