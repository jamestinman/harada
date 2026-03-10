/**
 * Universal synthesizer store: presets, ADSR envelope, lowpass filter.
 * Class-based Svelte 5 store for reactive instrument selection.
 */

const PRESETS = {
	// Two oscillators: triangle "strike" + sine "body", detuned 2–3 cents for thickness
	piano: {
		osc1Type: 'triangle',
		osc2Type: 'sine',
		detune: 2.5,
		vibratoFreq: 0,
		vibratoDepth: 0,
		attack: 0.01,
		decay: 0.2,
		sustain: 0.3,
		release: 0.5,
		filterFreq: 2000
	},
	bell: {
		pitchOctaves: 1, // Start an octave higher
		osc1Type: 'sine', // The "Hum" (body of the bell)
		osc2Type: 'sine', // The "Strike" (metallic ping)
		detune: 1205, // Detuned by ~1 octave + 5 cents for that "clash"
		attack: 0.001, // Instant strike
		decay: 1.5, // Long ring-out
		sustain: 0.01, // Bells don't hold volume
		release: 1.5,
		filterStart: 8000, // Keep it bright
		filterEnd: 2000, // Muffle slightly as it fades
		filterAttack: 0.5
	}
};

const MASTER_GAIN = 0.18;
const MIN_GAIN = 0.0001;

/** Create a distortion curve for WaveShaper (amount typically 0–1, scaled to 0–100 for the formula). */
function makeDistortionCurve(amount) {
	const k = typeof amount === 'number' ? amount : 50;
	const n_samples = 44100;
	const curve = new Float32Array(n_samples);
	const deg = Math.PI / 180;
	for (let i = 0; i < n_samples; ++i) {
		const x = (i * 2) / n_samples - 1;
		curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
	}
	return curve;
}

class SynthStore {
	currentInstrument = $state('piano');
	showBlackKeys = $state(true);
	arpeggiator = $state(false);
	/** Length of each arpeggiator note in seconds (0.05–0.4). */
	arpeggiatorRate = $state(0.2);
	#audioContext = null;
	#masterGain = null;
	#voices = new Map();

	#ensureAudio() {
		if (!this.#audioContext) {
			this.#audioContext = new window.AudioContext();
			this.#masterGain = this.#audioContext.createGain();
			this.#masterGain.gain.value = MASTER_GAIN;
			this.#masterGain.connect(this.#audioContext.destination);
		}
		if (this.#audioContext.state === 'suspended') {
			this.#audioContext.resume();
		}
	}

	get preset() {
		return PRESETS[this.currentInstrument] ?? PRESETS.piano;
	}

	/** @param {string} keyId @param {number} frequency */
	startNote(keyId, frequency) {
		if (this.#voices.has(keyId)) return;
		this.#ensureAudio();
		if (!this.#audioContext || !this.#masterGain) return;

		const p = this.preset;
		const ctx = this.#audioContext;
		const now = ctx.currentTime;
		if (!Number.isFinite(frequency) || frequency <= 0) return;
		const pitchMult = Math.pow(2, p.pitchOctaves ?? 0);
		const freq = frequency * pitchMult;
		if (!Number.isFinite(freq) || freq <= 0) return;

		// Oscillators: single (oscType), dual (osc1Type + osc2Type), or triple (osc1Type + osc2Type + osc3Type)
		const osc1Type = p.osc1Type ?? p.oscType;
		const osc2Type = p.osc2Type;
		const osc3Type = p.osc3Type;
		const detune = p.detune ?? 0;
		const detune1 = p.detune1 ?? 0;
		const detune2 = p.detune2 ?? detune;
		const detune3 = p.detune3;

		const slideTime = p.slideTime != null ? Number(p.slideTime) : null;
		const slideDuration = Number.isFinite(slideTime) && slideTime > 0 ? slideTime : 0.01;
		const startFreq = slideTime != null ? Math.max(1, freq * 0.5) : freq;

		const osc1 = ctx.createOscillator();
		osc1.type = osc1Type;
		if (slideTime != null) {
			osc1.frequency.setValueAtTime(startFreq, now);
			osc1.frequency.exponentialRampToValueAtTime(freq, now + slideDuration);
		} else {
			osc1.frequency.value = freq;
		}
		osc1.detune.value = detune1;
		const osc1Gain = p.osc1Gain ?? 1.0;
		const osc1GainNode = osc1Gain !== 1.0 ? ctx.createGain() : null;
		if (osc1GainNode) {
			osc1GainNode.gain.value = osc1Gain;
			osc1.connect(osc1GainNode);
		}

		const oscillators = [{ osc: osc1, gainNode: osc1GainNode }];
		if (osc2Type != null) {
			const osc2 = ctx.createOscillator();
			osc2.type = osc2Type;
			if (slideTime != null) {
				osc2.frequency.setValueAtTime(startFreq, now);
				osc2.frequency.exponentialRampToValueAtTime(freq, now + slideDuration);
			} else {
				osc2.frequency.value = freq;
			}
			osc2.detune.value = detune2;
			const osc2Gain = p.osc2Gain ?? 1.0;
			const osc2GainNode = osc2Gain !== 1.0 ? ctx.createGain() : null;
			if (osc2GainNode) {
				osc2GainNode.gain.value = osc2Gain;
				osc2.connect(osc2GainNode);
			}
			oscillators.push({ osc: osc2, gainNode: osc2GainNode });
		}
		if (osc3Type != null) {
			const osc3 = ctx.createOscillator();
			osc3.type = osc3Type;
			if (slideTime != null) {
				osc3.frequency.setValueAtTime(startFreq, now);
				osc3.frequency.exponentialRampToValueAtTime(freq, now + slideDuration);
			} else {
				osc3.frequency.value = freq;
			}
			osc3.detune.value = detune3 ?? 0;
			const osc3Gain = p.osc3Gain ?? 1.0;
			const osc3GainNode = osc3Gain !== 1.0 ? ctx.createGain() : null;
			if (osc3GainNode) {
				osc3GainNode.gain.value = osc3Gain;
				osc3.connect(osc3GainNode);
			}
			oscillators.push({ osc: osc3, gainNode: osc3GainNode });
		}

		// Vibrato LFO: connect to all oscillators' detune
		const vibratoFreq = p.vibratoFreq ?? p.lfoFreq ?? 0;
		const vibratoDepth = p.vibratoDepth ?? p.lfoCents ?? 0;
		const tremoloDepth = p.tremoloDepth ?? 0;
		let lfoOsc = null;
		let lfoGain = null;
		let tremoloGainNode = null;
		let tremoloOffset = null;
		if (vibratoFreq > 0 && (vibratoDepth > 0 || tremoloDepth > 0)) {
			lfoOsc = ctx.createOscillator();
			lfoOsc.type = 'sine';
			lfoOsc.frequency.value = vibratoFreq;
			
			if (vibratoDepth > 0) {
				lfoGain = ctx.createGain();
				lfoGain.gain.value = vibratoDepth;
				lfoOsc.connect(lfoGain);
				oscillators.forEach(({ osc }) => lfoGain.connect(osc.detune));
			}
			
			// Leslie tremolo: modulate volume with LFO (spinning speaker effect)
			if (tremoloDepth > 0) {
				tremoloGainNode = ctx.createGain();
				tremoloGainNode.gain.value = 1.0;
				// Create offset (1.0) - LFO modulation will be added via scheduling
				tremoloOffset = ctx.createConstantSource();
				tremoloOffset.offset.value = 1.0;
				tremoloOffset.connect(tremoloGainNode.gain);
				tremoloOffset.start();
				// Note: Full real-time Leslie tremolo requires scheduled gain updates
				// or a custom AudioWorklet. For now, base tremolo is set up.
			}
			
			lfoOsc.start();
		}

		// Distortion pedal (e.g. for guitar): WaveShaper before filter
		const distortionAmount = p.distortion;
		let dist = null;
		if (distortionAmount != null && distortionAmount > 0) {
			dist = ctx.createWaveShaper();
			dist.curve = makeDistortionCurve(distortionAmount * 100);
			dist.oversample = '4x';
		}

		// Filter: envelope (filterStart → filterEnd) or fixed/filterFreqStart ramp
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		if (p.filterStart != null && p.filterEnd != null) {
			const fStart = Number(p.filterStart);
			const fEnd = Math.max(1, Number(p.filterEnd));
			if (Number.isFinite(fStart) && Number.isFinite(fEnd)) {
				filter.frequency.setValueAtTime(fStart, now);
				filter.frequency.exponentialRampToValueAtTime(
					fEnd,
					now + (p.filterAttack ?? 0.2)
				);
			} else {
				filter.frequency.value = Number.isFinite(fEnd) ? fEnd : 2000;
			}
		} else {
			const filterStart = Math.max(1, Number(p.filterFreqStart ?? p.filterFreq) || 1000);
			const filterEnd = Number(p.filterFreq);
			filter.frequency.setValueAtTime(Number.isFinite(filterStart) ? filterStart : 1000, now);
			if (p.filterFreqStart != null && Number.isFinite(filterEnd) && filterEnd > filterStart) {
				filter.frequency.linearRampToValueAtTime(
					filterEnd,
					now + p.attack + (p.decay ?? 0.2)
				);
			}
		}

		// Volume ADSR
		const gainNode = ctx.createGain();
		const attack = Math.max(Number(p.attack) || 0.01, 0.002);
		const decay = Number(p.decay) || 0.2;
		const sustain = Math.max(Number(p.sustain) || 0.5, MIN_GAIN);
		gainNode.gain.setValueAtTime(MIN_GAIN, now);
		gainNode.gain.linearRampToValueAtTime(1, now + attack);
		gainNode.gain.exponentialRampToValueAtTime(
			Number.isFinite(sustain) ? sustain : MIN_GAIN,
			now + attack + decay
		);

		// Leslie tremolo: modulate volume with LFO (spinning speaker effect)
		if (tremoloDepth > 0 && tremoloGainNode) {
			// tremoloGainNode is already created and connected to offset (1.0)
			// For real-time LFO modulation, we'd need scheduled updates or AudioWorklet
			// For now, tremoloGainNode provides base volume control
			filter.connect(tremoloGainNode);
			tremoloGainNode.connect(gainNode);
		} else {
			filter.connect(gainNode);
		}

		// Key click: tiny high-frequency burst for vintage organ feel
		let keyClickOsc = null;
		if (p.keyClick === true || (p.keyClick !== false && p.keyClickFreq != null)) {
			const clickFreq = p.keyClickFreq ?? 6000;
			const clickDuration = p.keyClickDuration ?? 0.005;
			keyClickOsc = ctx.createOscillator();
			const clickGain = ctx.createGain();
			keyClickOsc.type = 'sine';
			keyClickOsc.frequency.value = clickFreq;
			clickGain.gain.setValueAtTime(0.3, now);
			clickGain.gain.exponentialRampToValueAtTime(MIN_GAIN, now + clickDuration);
			keyClickOsc.connect(clickGain);
			clickGain.connect(this.#masterGain);
			keyClickOsc.start(now);
			keyClickOsc.stop(now + clickDuration + 0.01);
		}

		// Connect: oscillators → (distortion) → filter → (tremolo) → gain → master
		const distortionTarget = dist ?? filter;
		oscillators.forEach(({ osc, gainNode: oscGainNode }) => {
			if (oscGainNode) {
				oscGainNode.connect(distortionTarget);
			} else {
				osc.connect(distortionTarget);
			}
			osc.start(now);
		});
		if (dist) dist.connect(filter);
		gainNode.connect(this.#masterGain);

		this.#voices.set(keyId, {
			oscillators,
			lfoOsc,
			gainNode,
			filter,
			keyClickOsc,
			tremoloGainNode,
			tremoloOffset
		});
	}

	/** @param {string} keyId */
	stopNote(keyId) {
		const voice = this.#voices.get(keyId);
		if (!voice || !this.#audioContext) return;

		const p = this.preset;
		const now = this.#audioContext.currentTime;
		const release = p.release ?? 0.3;
		const stopTime = now + release + 0.01;

		voice.gainNode.gain.cancelScheduledValues(now);
		voice.gainNode.gain.setValueAtTime(
			Math.max(voice.gainNode.gain.value, MIN_GAIN),
			now
		);
		voice.gainNode.gain.exponentialRampToValueAtTime(MIN_GAIN, now + release);
		voice.oscillators.forEach(({ osc }) => osc.stop(stopTime));
		if (voice.lfoOsc) voice.lfoOsc.stop(stopTime);
		if (voice.tremoloOffset) voice.tremoloOffset.stop(stopTime);
		if (voice.keyClickOsc) voice.keyClickOsc.stop(stopTime);
		this.#voices.delete(keyId);
	}

	/**
	 * Play a short bell "ping" without affecting the current instrument
	 * or tracked voices. Intended for lightweight UI feedback (e.g. task completed).
	 * @param {number} frequency Base frequency in Hz (defaults to a mid-high A)
	 */
	playBell(frequency = 440) {
		this.#ensureAudio();
		if (!this.#audioContext || !this.#masterGain) return;

		const p = PRESETS.bell;
		const ctx = this.#audioContext;
		const now = ctx.currentTime;
		if (!Number.isFinite(frequency) || frequency <= 0) return;

		const pitchMult = Math.pow(2, p.pitchOctaves ?? 0);
		const freq = frequency * pitchMult;
		if (!Number.isFinite(freq) || freq <= 0) return;

		// Simple dual-oscillator bell using the bell preset
		const osc1 = ctx.createOscillator();
		osc1.type = p.osc1Type ?? 'sine';
		osc1.frequency.value = freq;

		const osc2 = ctx.createOscillator();
		osc2.type = p.osc2Type ?? 'sine';
		osc2.frequency.value = freq;
		osc2.detune.value = p.detune ?? 0;

		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		if (p.filterStart != null && p.filterEnd != null) {
			const fStart = Number(p.filterStart);
			const fEnd = Math.max(1, Number(p.filterEnd));
			if (Number.isFinite(fStart) && Number.isFinite(fEnd)) {
				filter.frequency.setValueAtTime(fStart, now);
				filter.frequency.exponentialRampToValueAtTime(
					fEnd,
					now + (p.filterAttack ?? 0.2)
				);
			} else {
				filter.frequency.value = Number.isFinite(fEnd) ? fEnd : 4000;
			}
		} else {
			filter.frequency.value = 6000;
		}

		const gainNode = ctx.createGain();
		// Medium-length UI bell: short attack, modest tail
		const attack = Math.max(Number(p.attack) || 0.005, 0.002);
		const decay = 0.4;
		const sustain = Math.max(Number(p.sustain) || 0.2, MIN_GAIN);
		const release = 0;

		gainNode.gain.setValueAtTime(MIN_GAIN, now);
		gainNode.gain.linearRampToValueAtTime(1, now + attack);
		gainNode.gain.exponentialRampToValueAtTime(
			Number.isFinite(sustain) ? sustain : MIN_GAIN,
			now + attack + decay
		);

		osc1.connect(filter);
		osc2.connect(filter);
		filter.connect(gainNode);
		gainNode.connect(this.#masterGain);

		osc1.start(now);
		osc2.start(now);

		// Schedule release and cleanup
		const releaseStart = now + attack + decay;
		const stopTime = releaseStart + release + 0.05;
		gainNode.gain.setValueAtTime(
			Math.max(gainNode.gain.value, MIN_GAIN),
			releaseStart
		);
		gainNode.gain.exponentialRampToValueAtTime(MIN_GAIN, releaseStart + release);
		osc1.stop(stopTime);
		osc2.stop(stopTime);
	}

	stopAll() {
		this.#voices.forEach((_, keyId) => this.stopNote(keyId));
	}

	/** @param {string} name */
	setInstrument(name) {
		if (PRESETS[name]) this.currentInstrument = name;
	}

	toggleBlackKeys() {
		this.showBlackKeys = !this.showBlackKeys;
	}

	toggleArpeggiator() {
		this.arpeggiator = !this.arpeggiator;
	}

	/** @param {number} durationSec Note length in seconds (0.05–0.4) */
	setArpeggiatorRate(durationSec) {
		this.arpeggiatorRate = Math.max(0.05, Math.min(0.4, durationSec));
	}

	close() {
		this.stopAll();
		this.#audioContext?.close();
		this.#audioContext = null;
		this.#masterGain = null;
	}
}

export const synthStore = new SynthStore();
export { PRESETS };
