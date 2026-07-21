import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { LanguageSelector, SpeakerButton } from '../../components/kit';
import { Skeleton } from '../../components/Skeleton';
import { InteractiveMap, type MapMarker, type InteractiveMapHandle } from '../../components/InteractiveMap';
import { LocationPickerModal } from '../../components/LocationPickerModal';
import { getPlaces, suggestPlaceLocation, ttsUrl, type Place } from '../../lib/api';
import { useLang } from '../../lib/langContext';
import { useAccent } from '../../lib/accent';
import { langMeta } from '../../lib/langMeta';
import { TILE_KEY, LANG_POINTS, TOWNS } from '../../lib/mapConfig';
import { C, F, S, radius, shadow, LANG_ART } from '../../lib/theme';

export default function MapScreen() {
  const { code, setCode, languages, lang } = useLang();
  const accent = useAccent();
  const [places, setPlaces] = useState<Place[]>([]);
  const [withCoords, setWithCoords] = useState(0);
  const [loading, setLoading] = useState(false);
  const [picker, setPicker] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [pinTarget, setPinTarget] = useState<Place | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const mapRef = useRef<InteractiveMapHandle>(null);
  const listRef = useRef<FlatList<Place>>(null);
  const walkPlayer = useRef<AudioPlayer | null>(null);

  const placed = places.filter((p) => p.longitude != null && p.latitude != null);

  function playWord(word: string) {
    try { walkPlayer.current?.remove(); const p = createAudioPlayer({ uri: ttsUrl(code, word) }); walkPlayer.current = p; p.play(); } catch {}
  }

  // "Walk Country": step gently from place to place, flying, pulsing the pin,
  // scrolling the card into view, and speaking the name (#8).
  useEffect(() => {
    if (!walking) return;
    if (placed.length < 2) { setWalking(false); return; }
    let i = 0, cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      if (cancelled) return;
      if (i >= placed.length) { setWalking(false); return; }
      const p = placed[i];
      setActive(p.id);
      mapRef.current?.flyTo(p.longitude!, p.latitude!, 11);
      mapRef.current?.pulse(p.word);
      const idx = places.findIndex((x) => x.id === p.id);
      if (idx >= 0) { try { listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.35, animated: true }); } catch {} }
      playWord(p.word);
      i += 1;
      timer = setTimeout(step, 5000);
    };
    timer = setTimeout(step, 450);
    return () => { cancelled = true; clearTimeout(timer); mapRef.current?.pulse(null); walkPlayer.current?.remove(); };
  }, [walking]);

  useEffect(() => () => { walkPlayer.current?.remove(); }, []);

  function focusFromMap(label: string) {
    const idx = places.findIndex((p) => p.word === label);
    if (idx < 0) return;
    setActive(places[idx].id);
    try { listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 }); } catch {}
  }

  useEffect(() => {
    let on = true; setLoading(true); setPlaces([]); setActive(null); setWalking(false);
    getPlaces(code).then((r) => { if (on) { setPlaces(r.places); setWithCoords(r.withCoords); setLoading(false); } });
    return () => { on = false; };
  }, [code]);

  const meta = langMeta(code);
  const langName = lang?.name ?? 'Kuku Yalanji';
  const art = LANG_ART[code];
  const point = LANG_POINTS[code];

  const markers: MapMarker[] = [];
  if (point) markers.push({ lng: point.lng, lat: point.lat, kind: 'lang', label: langName });
  for (const t of TOWNS[code] ?? []) markers.push({ lng: t.lng, lat: t.lat, label: t.name, kind: 'town' });
  for (const p of places) if (p.longitude != null && p.latitude != null) markers.push({ lng: p.longitude, lat: p.latitude, label: p.word, kind: 'place' });

  function tapPlace(p: Place) {
    if (p.longitude == null || p.latitude == null) return;
    setActive(p.id === active ? null : p.id);
    mapRef.current?.flyTo(p.longitude, p.latitude, 12);
  }

  async function submitPin(lat: number, lng: number) {
    if (!pinTarget) return;
    await suggestPlaceLocation(pinTarget.id, lat, lng);
    setToast(`Thanks — your suggested spot for “${pinTarget.word}” is with the keepers for review.`);
    setTimeout(() => setToast(null), 4000);
  }

  const pinStart = pinTarget
    ? (pinTarget.longitude != null && pinTarget.latitude != null
        ? { lng: pinTarget.longitude, lat: pinTarget.latitude }
        : (point ? { lng: point.lng, lat: point.lat } : { lng: 134, lat: -25 }))
    : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Country</Text>
          <Text style={styles.sub}>Where {langName} is spoken</Text>
        </View>
        <Pressable style={[styles.langChip, { backgroundColor: accent.accentSoft }]} onPress={() => setPicker(true)}>
          <Text style={[styles.langChipText, { color: accent.accentDeep }]} numberOfLines={1}>{langName}</Text>
          <Ionicons name="chevron-down" size={14} color={accent.accent} />
        </Pressable>
      </View>

      {/* ever-present map */}
      <View style={styles.mapBox}>
        {TILE_KEY ? (
          <InteractiveMap ref={mapRef} key={code} markers={markers} onSelect={focusFromMap} accent={accent.accent}
            center={point ? [point.lng, point.lat] : undefined} zoom={point ? 6.5 : 3} fit={markers.length > 1} />
        ) : (
          <>
            {art?.map && <Image source={art.map} style={StyleSheet.absoluteFill as any} resizeMode="cover" />}
            <LinearGradient colors={['rgba(34,56,42,0)', 'rgba(34,56,42,0.5)']} style={StyleSheet.absoluteFill} />
          </>
        )}
        {placed.length >= 2 && (
          <Pressable onPress={() => setWalking((w) => !w)}
            style={({ pressed }) => [styles.walkBtn, { backgroundColor: walking ? C.danger : accent.accent }, pressed && { transform: [{ scale: 0.97 }] }]}>
            <Ionicons name={walking ? 'stop' : 'walk'} size={17} color={C.white} />
            <Text style={styles.walkText}>{walking ? 'Stop walk' : 'Walk Country'}</Text>
          </Pressable>
        )}
      </View>

      {/* place list scrolls below the map */}
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={places}
        keyExtractor={(p) => p.id}
        refreshControl={
          <RefreshControl refreshing={loading && places.length > 0} tintColor={accent.accent} colors={[accent.accent]}
            onRefresh={() => { setWalking(false); setPlaces([]); getPlaces(code).then((r) => { setPlaces(r.places); setWithCoords(r.withCoords); }); }} />
        }
        onScrollToIndexFailed={({ index }) => { setTimeout(() => { try { listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 }); } catch {} }, 300); }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 36, gap: 10 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 6 }}>
            <Text style={styles.region}>{meta.region || langName}</Text>
            <Text style={styles.section}>PLACE NAMES{places.length ? ` · ${places.length}` : ''}{withCoords ? `  ·  ${withCoords} on map` : ''}</Text>
            {loading && (
              <View style={{ gap: 10, marginTop: 14 }}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={[styles.row, { gap: 12 }]}>
                    <Skeleton width={30} height={30} radius={radius.pill} />
                    <View style={{ flex: 1, gap: 8 }}><Skeleton width="50%" height={18} /><Skeleton width="80%" height={12} /></View>
                  </View>
                ))}
              </View>
            )}
            {!loading && places.length === 0 && <Text style={styles.empty}>No place names recorded for {langName} yet.</Text>}
          </View>
        }
        renderItem={({ item: p, index }) => {
          const hasCoords = p.longitude != null && p.latitude != null;
          const on = active === p.id;
          return (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).springify().damping(20).mass(0.7)}>
              <Pressable onPress={() => tapPlace(p)}
                style={({ pressed }) => [styles.row, on && { borderColor: accent.accent, borderWidth: 2 }, pressed && { transform: [{ scale: 0.99 }] }]}>
                <View style={[styles.pinDot, !hasCoords && { backgroundColor: C.hair }]}>
                  <Ionicons name={hasCoords ? 'location' : 'help'} size={14} color={hasCoords ? C.clay : C.faint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.placeName}>{p.word}</Text>
                  {!!p.meaning && <Text style={styles.placeMeaning} numberOfLines={2}>{p.meaning}</Text>}
                  {!hasCoords && <Text style={styles.unplaced}>Not on the map yet · suggest where it is</Text>}
                </View>
                <SpeakerButton code={code} text={p.word} size="sm" />
                <Pressable onPress={() => setPinTarget(p)} hitSlop={8}
                  style={[styles.suggestBtn, !hasCoords && { backgroundColor: C.claySoft }]}>
                  <Ionicons name={hasCoords ? 'create-outline' : 'add'} size={18} color={C.clay} />
                </Pressable>
              </Pressable>
            </Animated.View>
          );
        }}
        ListFooterComponent={
          <Text style={styles.note}>Tap a place to find it on the map, or tap the pin button to suggest where it is. Maps are artistic impressions of Country, not surveyed boundaries.</Text>
        }
      />

      {pinTarget && pinStart && (
        <LocationPickerModal
          word={pinTarget.word}
          start={pinStart}
          towns={TOWNS[code]?.map((t) => ({ name: t.name, lng: t.lng, lat: t.lat }))}
          onSubmit={submitPin}
          onClose={() => setPinTarget(null)}
        />
      )}

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={18} color={C.white} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <LanguageSelector visible={picker} languages={languages} value={code} onSelect={setCode} onClose={() => setPicker(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 },
  title: { fontFamily: F.display, fontSize: S.display, color: C.ink },
  sub: { fontFamily: F.serifItalic, fontSize: S.body, color: C.sage, marginTop: 1 },
  langChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.sageSoft, paddingHorizontal: 12, height: 36, borderRadius: radius.pill, maxWidth: 160, marginTop: 4 },
  langChipText: { fontFamily: F.semibold, fontSize: S.label, color: C.forest },

  mapBox: { height: 320, marginHorizontal: 20, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: C.sageSoft, ...shadow },
  walkBtn: { position: 'absolute', bottom: 12, alignSelf: 'center', left: '50%', marginLeft: -74, width: 148, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 42, borderRadius: radius.pill, ...shadow },
  walkText: { fontFamily: F.bold, fontSize: S.small + 1, color: C.white },

  region: { fontFamily: F.display, fontSize: S.title, color: C.ink },
  section: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.sage, marginTop: 4 },
  empty: { fontFamily: F.body, fontSize: S.label, color: C.muted, marginTop: 12 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.hair, padding: 14, ...shadow },
  pinDot: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: C.claySoft, alignItems: 'center', justifyContent: 'center' },
  placeName: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  placeMeaning: { fontFamily: F.body, fontSize: S.label, color: C.muted, marginTop: 2 },
  unplaced: { fontFamily: F.semibold, fontSize: S.small, color: C.clay, marginTop: 4 },
  suggestBtn: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: C.claySoft, alignItems: 'center', justifyContent: 'center' },

  note: { fontFamily: F.body, fontSize: S.small, color: C.faint, textAlign: 'center', lineHeight: 18, marginTop: 16 },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.forest, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 16, ...shadow },
  toastText: { flex: 1, fontFamily: F.semibold, fontSize: S.small, color: C.white, lineHeight: 18 },
});
