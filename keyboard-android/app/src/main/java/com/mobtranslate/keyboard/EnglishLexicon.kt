package com.mobtranslate.keyboard

import android.content.Context

/**
 * A small English lexicon (common words, frequency-ordered) used to make the
 * keyboard feel normal: as you type it offers completions and fixes typos. It is
 * also the bridge to translation — the corrected English word is what we look up
 * in the Aboriginal dictionary.
 *
 * Loaded once from assets/english/words.txt (~10k words, most-common first).
 */
object EnglishLexicon {

    private var words: List<String> = emptyList()      // frequency order
    private var rank: Map<String, Int> = emptyMap()
    private var set: Set<String> = emptySet()
    private var loaded = false

    @Synchronized
    fun ensureLoaded(context: Context) {
        if (loaded) return
        try {
            val list = context.assets.open("english/words.txt")
                .bufferedReader(Charsets.UTF_8)
                .useLines { seq -> seq.map { it.trim() }.filter { it.length >= 2 }.toList() }
            words = list
            rank = HashMap<String, Int>(list.size).apply {
                list.forEachIndexed { i, w -> if (!containsKey(w)) put(w, i) }
            }
            set = list.toHashSet()
        } catch (_: Exception) {
            // No list -> the keyboard still types; just no English suggestions.
        }
        loaded = true
    }

    fun isWord(w: String): Boolean = set.contains(w)

    /**
     * Suggestions for a partly/fully typed English word:
     *  - completions (words starting with it), most-common first;
     *  - corrections (edit distance <= 2) when it isn't already a known word.
     * The typed word itself is never returned.
     */
    fun suggest(raw: String, limit: Int = 3): List<String> {
        val w = raw.lowercase()
        if (w.length < 2 || words.isEmpty()) return emptyList()

        val out = LinkedHashSet<String>()

        // Completions (frequency-ordered list -> first hits are the common ones).
        for (cand in words) {
            if (cand != w && cand.startsWith(w)) {
                out.add(cand)
                if (out.size >= limit) break
            }
        }

        // Corrections for likely typos (only when the word isn't already valid).
        if (!set.contains(w) && out.size < limit) {
            val corrections = ArrayList<Pair<String, Int>>()
            val lo = w.length - 2
            val hi = w.length + 2
            for (cand in words) {
                if (cand.length in lo..hi) {
                    val d = boundedEdit(w, cand, 2)
                    if (d in 1..2) corrections.add(cand to (d * 100000 + (rank[cand] ?: 999999)))
                }
            }
            corrections.sortBy { it.second }
            for ((cand, _) in corrections) {
                out.add(cand)
                if (out.size >= limit) break
            }
        }

        return out.take(limit).toList()
    }

    /** Levenshtein distance, abandoned (returns max+1) once it exceeds [max]. */
    private fun boundedEdit(a: String, b: String, max: Int): Int {
        if (kotlin.math.abs(a.length - b.length) > max) return max + 1
        var prev = IntArray(b.length + 1) { it }
        var cur = IntArray(b.length + 1)
        for (i in 1..a.length) {
            cur[0] = i
            var rowMin = cur[0]
            for (j in 1..b.length) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                cur[j] = minOf(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
                if (cur[j] < rowMin) rowMin = cur[j]
            }
            if (rowMin > max) return max + 1
            val tmp = prev; prev = cur; cur = tmp
        }
        return prev[b.length]
    }
}
