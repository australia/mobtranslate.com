import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './kit';
import { MAP_STYLE_URL } from '../lib/mapConfig';
import { C, F, S, radius } from '../lib/theme';

/** Drag-a-pin map so anyone can suggest where a place name sits. Starts at the
 *  place's current spot if known, else the language's Country centroid. The pin
 *  is draggable AND tap-to-move; the chosen lng/lat flow back over postMessage. */
export function LocationPickerModal({
  word, start, towns, onSubmit, onClose,
}: {
  word: string;
  start: { lng: number; lat: number };
  towns?: { name: string; lng: number; lat: number }[];
  onSubmit: (lat: number, lng: number) => Promise<void>;
  onClose: () => void;
}) {
  const [pos, setPos] = useState<{ lng: number; lat: number }>(start);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  const html = useMemo(() => {
    const style = JSON.stringify(MAP_STYLE_URL);
    const c = `[${start.lng},${start.lat}]`;
    const tw = JSON.stringify((towns ?? []).filter((t) => isFinite(t.lng) && isFinite(t.lat)));
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet"/>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>html,body,#map{margin:0;height:100%;background:#EAF0E4;overflow:hidden}
.pin{font-size:40px;line-height:40px;transform:translateY(-4px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.4));cursor:grab}
.tk{display:flex;flex-direction:column;align-items:center;transform:translateY(-50%);pointer-events:none}
.tk .d{width:7px;height:7px;border-radius:50%;background:#7C8A79;border:1.5px solid #fff}
.tk .l{margin-top:2px;font:600 10px/1.2 -apple-system,system-ui,sans-serif;color:#5C6A59;text-shadow:0 1px 2px #EAF0E4,0 0 3px #EAF0E4;white-space:nowrap}</style>
</head><body><div id="map"></div><script>
var map=new maplibregl.Map({container:'map',style:${style},center:${c},zoom:9,attributionControl:false,dragRotate:false,pitchWithRotate:false});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
map.touchZoomRotate.disableRotation();
var towns=${tw};
function post(){var ll=mk.getLngLat();window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({lng:ll.lng,lat:ll.lat}));}
var pinEl=document.createElement('div');pinEl.className='pin';pinEl.textContent='\\uD83D\\uDCCD';
var mk=new maplibregl.Marker({element:pinEl,anchor:'bottom',draggable:true}).setLngLat(${c}).addTo(map);
mk.on('dragend',post);
map.on('load',function(){
 towns.forEach(function(t){var el=document.createElement('div');el.className='tk';var d=document.createElement('div');d.className='d';el.appendChild(d);var l=document.createElement('div');l.className='l';l.textContent=t.name;el.appendChild(l);new maplibregl.Marker({element:el,anchor:'top'}).setLngLat([t.lng,t.lat]).addTo(map);});
});
map.on('click',function(e){mk.setLngLat(e.lngLat);post();});
post();
</script></body></html>`;
  }, [start, towns]);

  async function save() {
    setSaving(true); setError(null);
    try { await onSubmit(posRef.current.lat, posRef.current.lng); onClose(); }
    catch (e: any) { setError(e?.message || 'Could not submit your suggestion.'); setSaving(false); }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kind}>SUGGEST A LOCATION</Text>
              <Text style={styles.title} numberOfLines={1}>{word}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
              <Ionicons name="close" size={22} color={C.ink} />
            </Pressable>
          </View>

          <View style={styles.mapBox}>
            <WebView
              originWhitelist={['*']}
              source={{ html }}
              style={{ flex: 1, backgroundColor: '#EAF0E4' }}
              onMessage={(e) => { try { const d = JSON.parse(e.nativeEvent.data); if (isFinite(d.lng) && isFinite(d.lat)) setPos({ lng: d.lng, lat: d.lat }); } catch {} }}
              javaScriptEnabled domStorageEnabled scrollEnabled={false} nestedScrollEnabled overScrollMode="never"
            />
          </View>

          <Text style={styles.hint}>Drag the pin, or tap the map, to where this place is. A language keeper reviews every suggestion before it appears.</Text>
          <Text style={styles.coords}>{pos.lat.toFixed(4)}, {pos.lng.toFixed(4)}</Text>
          {error && <Text style={styles.err}>{error}</Text>}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <Button label="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button label="Suggest this spot" icon="checkmark" onPress={save} loading={saving} style={{ flex: 1.4 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,28,22,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 18, paddingBottom: 28 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  kind: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.sage },
  title: { fontFamily: F.displayBold, fontSize: S.title, color: C.ink, marginTop: 2 },
  close: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  mapBox: { height: 360, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: C.sageSoft },
  hint: { fontFamily: F.body, fontSize: S.small, color: C.muted, lineHeight: 18, marginTop: 12 },
  coords: { fontFamily: F.semibold, fontSize: S.small, color: C.sage, marginTop: 6 },
  err: { fontFamily: F.medium, fontSize: S.label, color: C.danger, marginTop: 8 },
});
