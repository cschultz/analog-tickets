import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import TrueDuotonePanel from "@/components/may/TrueDuotonePanel";
import { usePageMeta } from "@/hooks/usePageMeta";
import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import boomboxImg from "@/assets/may/mixtape/boombox.webp";
import cassetteFront from "@/assets/may/mixtape/cassette-front.webp";
import cassetteBack from "@/assets/may/mixtape/cassette-back-viiiibes.webp";
import cassettesBoxImg from "@/assets/may/mixtape/cassettes-box.webp";
import gilliganLiveImg from "@/assets/may/mixtape/gilligan-moss-live.webp";
import { getPublicStorageUrl } from "@/platform/config/env";

const STORAGE_BASE = getPublicStorageUrl("mixtapes/gilligan-moss");

type Side = "A" | "B";

const SIDES: Record<Side, { label: string; mood: string; src: string; tracks: string[] }> = {
  A: {
    label: "Side A",
    mood: "Pump-up mix",
    src: `${STORAGE_BASE}/side-a.m4a`,
    tracks: [
      "Gilligan Moss — Robbery",
      "Gilligan Moss — Turn Back Time (Bad Tuner Remix)",
      "DRAMA & Neil Frances — Energy (Ewan McVicar '05 Mix)",
      "Fcukers — Bon Bon (Confidence Man Remix)",
      "Ari Bald & CJ Scott — Grape Ape",
      "Bad Tuner — With You Love",
      "Loods — Being With You",
      "Patrick Holland — Your Life",
      "Jamie XX feat. Robyn — Life",
      "Kinijo — Make Me Feel (Extended Mix)",
      "Holiday87 feat. Betsy — Something Bout You (Kornel Kovacs Remix)",
      "Confidence Man — Firebreak (Chloe Calliet Remix)",
      "JEV — Speaking Out Loud",
      "Romy — Lifetime (Haai's Green Lamborghini Mix)",
    ],
  },
  B: {
    label: "Side B",
    mood: "Wind-down mix",
    src: `${STORAGE_BASE}/side-b.m4a`,
    tracks: [
      "Gilligan Moss — Hemlock",
      "HNNY — There Is No One Else",
      "Snacks — Order to the Senses (Kornel Kovacs Remix)",
      "Pantha Du Prince — Liquid Lights",
      "Sofia Kourtesis — La Perla",
      "Andhim — Hausch",
      "Gilligan Moss — Ultraparadiso",
      "Gilligan Moss — Vibe Check",
      "Ishi Vu — This is Your Life (Original Mix)",
      "Moff & Tarkin — Take Me Home",
      "Rimbaudian — I Would Do Everything I Did Again and Again",
    ],
  },
};

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const Mixtape = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [side, setSide] = useState<Side>("A");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [flipped, setFlipped] = useState(false);

  const current = SIDES[side];
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration);
    const onEnd = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnd);
    };
  }, [side]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (e) {
        console.error("Playback failed", e);
      }
    }
  };

  const switchSide = (next: Side) => {
    if (next === side) return;
    setSide(next);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    // load() will fire after src changes via effect
    requestAnimationFrame(() => audioRef.current?.load());
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * duration;
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  };

  usePageMeta({
    title: "An Analog Mixtape by Gilligan Moss",
    description:
      "A two-sided mixtape from Gilligan Moss for Cosmico. Side A pumps you up, Side B winds you down. Press play.",
    ogImage: `${STORAGE_BASE}/cover-front.png`,
    ogUrl: typeof window !== "undefined" ? `${window.location.origin}/mixtape` : "/mixtape",
  });

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: COLORS.charcoal }}>
      <MayHeader transparentOnTop forceLightText />

      {/* HERO — split spread, homepage pattern */}
      <section className="relative" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          {/* LEFT: boombox image — true duotone, deepWater shadows → mustard highlights */}
          <TrueDuotonePanel
            image={boomboxImg}
            alt="Vintage Hitachi boombox in the grass at dusk"
            shadowColor={COLORS.forest}
            highlightColor={COLORS.mustard}
            objectPosition="center 45%"
            contrast={1.2}
            brightness={1.05}
            grainOpacity={0.22}
            className="min-h-[60vh] md:min-h-screen"
          />

          {/* RIGHT: deepWater panel — cool purple complements forest+mustard duotone */}
          <motion.div
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-center px-6 py-12 sm:p-10 md:p-10 lg:p-16"
            style={{ backgroundColor: COLORS.deepWater }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10 max-w-md">
              <p style={{ ...typography.caption, color: COLORS.mustard }}>
                A Mixtape · Volume 01 · 2026
              </p>
              <h1
                className="mt-4 text-[2.75rem] leading-[0.95] sm:text-5xl md:text-5xl lg:text-7xl"
                style={{ ...typography.headline, color: COLORS.white }}
              >
                Analog<br />Mixtape
              </h1>
              <p
                className="mt-4 text-lg sm:text-xl md:text-2xl"
                style={{ ...typography.subhead, color: COLORS.mustard }}
              >
                by Gilligan Moss
              </p>
              <p
                className="mt-5"
                style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.92, fontSize: '16px', lineHeight: 1.7 }}
              >
                Press play, roll down the window, turn it up and get ready to dance Friday night
                at Cosmico.
              </p>
              <p
                className="mt-6"
                style={{ ...typography.caption, color: COLORS.dustySky }}
              >
                Made this for you ♡
              </p>
            </div>
          </motion.div>
        </div>
      </section>


      {/* PLAYER */}
      <section className="relative" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative max-w-6xl mx-auto px-6 py-16 md:py-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
            {/* Cassette art */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
              className="relative"
              style={{ perspective: "1200px" }}
            >
              <motion.button
                type="button"
                onClick={() => setFlipped((f) => !f)}
                aria-label={flipped ? "Show cassette front" : "Show tracklist"}
                className="relative w-full block bg-transparent border-0 p-0 cursor-pointer"
                animate={{
                  rotate: isPlaying ? [-2, -1.5, -2] : -2,
                }}
                transition={{
                  rotate: { duration: 4, repeat: Infinity, ease: "easeInOut" },
                }}
                style={{
                  filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.25))",
                }}
              >
                <motion.img
                  key={flipped ? "tracklist-back" : "cassette-front"}
                  src={flipped ? cassetteBack : cassetteFront}
                  alt={flipped ? "Analog Mixtape tracklist" : "Analog Mixtape cassette by Gilligan Moss"}
                  className="w-full h-auto block"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  initial={{ opacity: 0.35, rotateY: -90 }}
                  animate={{ opacity: 1, rotateY: 0 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformStyle: "preserve-3d" }}
                />
                {/* Preload the opposite side so the flip is instant */}
                <img
                  src={flipped ? cassetteFront : cassetteBack}
                  alt=""
                  aria-hidden="true"
                  className="hidden"
                  loading="eager"
                  decoding="async"
                />
              </motion.button>
              <p
                className="mt-4 text-center"
                style={{ ...typography.caption, color: COLORS.charcoal, opacity: 0.7 }}
              >
                {flipped ? "← Tap to flip back" : "Tap to flip → tracklist"}
              </p>
            </motion.div>

            {/* Controls */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
              className="relative"
            >
              {/* Now playing caption */}
              <p className="mb-3" style={{ ...typography.caption, color: COLORS.charcoal }}>
                <span style={{ color: COLORS.mustard }}>●</span> Now Playing · Side {side}
              </p>
              {/* Side toggle */}
              <div className="flex gap-2 mb-6">
                {(["A", "B"] as Side[]).map((s) => {
                  const active = s === side;
                  return (
                    <button
                      key={s}
                      onClick={() => switchSide(s)}
                      className="px-5 py-3 transition-all"
                      style={{
                        ...typography.caption,
                        backgroundColor: active ? COLORS.charcoal : "transparent",
                        color: active ? COLORS.mustard : COLORS.charcoal,
                        border: `1px solid ${COLORS.charcoal}`,
                      }}
                      aria-pressed={active}
                    >
                      Side {s} · {SIDES[s].mood}
                    </button>
                  );
                })}
              </div>

              <h2
                className="text-3xl md:text-4xl mb-2"
                style={{ ...typography.headline, color: COLORS.charcoal }}
              >
                {current.label}
              </h2>
              <p
                className="mb-8"
                style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.7, fontSize: '15px', lineHeight: 1.7 }}
              >
                {current.mood} · {current.tracks.length} tracks
              </p>

              {/* Progress bar */}
              <div
                onClick={seek}
                className="relative w-full h-2 cursor-pointer mb-2"
                style={{ backgroundColor: `${COLORS.charcoal}22` }}
                role="slider"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Playback position"
              >
                <div
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${progress}%`, backgroundColor: COLORS.forest }}
                />
              </div>
              <div className="flex justify-between mb-6" style={{ ...typography.caption, color: COLORS.charcoal }}>
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              {/* Transport */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => switchSide("A")}
                  aria-label="Side A"
                  className="p-3 transition-opacity"
                  style={{ color: COLORS.charcoal, opacity: side === "A" ? 0.4 : 1 }}
                  disabled={side === "A"}
                >
                  <SkipBack size={24} strokeWidth={1.5} />
                </button>

                <button
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  className="w-20 h-20 rounded-full flex items-center justify-center transition-transform hover:scale-105"
                  style={{ backgroundColor: COLORS.charcoal, color: COLORS.mustard }}
                >
                  {isPlaying ? <Pause size={32} fill={COLORS.mustard} /> : <Play size={32} fill={COLORS.mustard} className="ml-1" />}
                </button>

                <button
                  onClick={() => switchSide("B")}
                  aria-label="Side B"
                  className="p-3 transition-opacity"
                  style={{ color: COLORS.charcoal, opacity: side === "B" ? 0.4 : 1 }}
                  disabled={side === "B"}
                >
                  <SkipForward size={24} strokeWidth={1.5} />
                </button>

                <button
                  onClick={toggleMute}
                  aria-label={muted ? "Unmute" : "Mute"}
                  className="p-3 ml-auto"
                  style={{ color: COLORS.charcoal }}
                >
                  {muted ? <VolumeX size={22} strokeWidth={1.5} /> : <Volume2 size={22} strokeWidth={1.5} />}
                </button>
              </div>

              <audio ref={audioRef} src={current.src} preload="metadata" playsInline />
            </motion.div>
          </div>
        </div>
      </section>

      {/* TRACKLIST */}
      <section className="relative" style={{ backgroundColor: COLORS.forest }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative max-w-6xl mx-auto px-6 py-12 md:py-16">
          <p style={{ ...typography.caption, color: COLORS.mustard }}>The Tracklist</p>
          <h2
            className="mt-2 text-3xl md:text-4xl mb-8"
            style={{ ...typography.headline, color: COLORS.white }}
          >
            VIIIIIBES
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
            {(["A", "B"] as Side[]).map((s) => (
              <div key={s}>
                <div className="flex items-baseline gap-3 mb-3">
                  <span
                    className="px-2.5 py-1"
                    style={{
                      ...typography.caption,
                      backgroundColor: COLORS.mustard,
                      color: COLORS.charcoal,
                    }}
                  >
                    {s}
                  </span>
                  <h3
                    className="text-xl"
                    style={{ ...typography.subhead, color: COLORS.white }}
                  >
                    {SIDES[s].label}
                  </h3>
                  <span style={{ ...typography.caption, color: COLORS.boulder }}>
                    {SIDES[s].mood}
                  </span>
                </div>
                <ol>
                  {SIDES[s].tracks.map((t, i) => (
                    <li
                      key={t}
                      className="flex gap-3 py-1.5 text-sm md:text-[15px] leading-snug"
                      style={{
                        ...typography.body,
                        color: COLORS.dustySky,
                        borderBottom: `1px solid ${COLORS.white}12`,
                      }}
                    >
                      <span style={{ color: COLORS.boulder, minWidth: "1.75rem" }}>
                        {(i + 1).toString().padStart(2, "0")}
                      </span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ol>
                <button
                  onClick={() => {
                    switchSide(s);
                    setTimeout(() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      togglePlay();
                    }, 200);
                  }}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2.5"
                  style={{
                    ...typography.caption,
                    backgroundColor: COLORS.mustard,
                    color: COLORS.charcoal,
                  }}
                >
                  <Play size={14} fill={COLORS.charcoal} /> Play Side {s}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LIMITED EDITION CASSETTES — split spread */}
      <section className="relative" style={{ backgroundColor: COLORS.deepWater }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-[80vh] md:[&>*:first-child]:order-2">
          {/* LEFT: cassettes photo — full color, light grain only */}
          <motion.div
            className="relative min-h-[60vh] md:min-h-[80vh] overflow-hidden"
            style={{ backgroundColor: COLORS.deepWater }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <img
              src={cassettesBoxImg}
              alt="A box of hand-labeled Gilligan Moss x Analog Mixtape cassettes"
              className="absolute inset-0 w-full h-full object-cover object-[center_50%]"
            />
            <FilmGrainOverlay opacity={0.35} />
          </motion.div>

          {/* RIGHT: clay panel with the pump */}
          <motion.div
            className="relative min-h-[60vh] md:min-h-[80vh] flex flex-col justify-center px-6 py-14 sm:p-10 md:p-12 lg:p-16"
            style={{ backgroundColor: COLORS.clay }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.15 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10 max-w-md lg:max-w-lg">
              <p style={{ ...typography.caption, color: COLORS.charcoal }}>
                Limited Edition · Hand-Dubbed
              </p>
              <h2
                className="mt-4 text-4xl md:text-5xl lg:text-6xl"
                style={{ ...typography.headline, color: COLORS.white }}
              >
                The real thing<br />on tape.
              </h2>
              <p
                className="mt-6"
                style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7 }}
              >
                A short run of physical cassettes — hand-labeled, individually numbered, dubbed
                from the master. Side A and Side B, exactly as Gilligan Moss made it.
              </p>
              <p
                className="mt-4"
                style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7 }}
              >
                If you prefer the analog life and still have a Walkman — or you're ready to hop on
                eBay — <strong style={{ color: COLORS.deepWater }}>you can have one.</strong>{" "}
                A limited-edition collectible, available with any purchase of Analog merch at the
                merch booth. When they're gone, they're gone.
              </p>
              <p
                className="mt-6"
                style={{ ...typography.caption, color: COLORS.deepWater }}
              >
                A collectible · Not for sale online
              </p>
              <div className="mt-8">
                <Link
                  to="/tickets"
                  className="inline-block px-7 py-4"
                  style={{
                    ...typography.button,
                    backgroundColor: COLORS.charcoal,
                    color: COLORS.mustard,
                  }}
                >
                  Get a Ticket · Get a Tape
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA — split spread, Gilligan Moss live */}
      <section className="relative" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-[80vh]">
          {/* LEFT: Gilligan Moss live photo — true duotone */}
          <TrueDuotonePanel
            image={gilliganLiveImg}
            alt="Gilligan Moss performing live on stage at dusk"
            shadowColor={COLORS.deepWater}
            highlightColor={COLORS.clay}
            objectPosition="center 30%"
            contrast={1.2}
            brightness={1.05}
            grainOpacity={0.22}
            className="min-h-[60vh] md:min-h-[80vh]"
          />

          {/* RIGHT: denim panel with the headliner call-out */}
          <motion.div
            className="relative min-h-[60vh] md:min-h-[80vh] flex flex-col justify-center px-6 py-14 sm:p-10 md:p-12 lg:p-16"
            style={{ backgroundColor: COLORS.denim }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.15 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10 max-w-md lg:max-w-lg">
              <p style={{ ...typography.caption, color: COLORS.mustard }}>
                Friday Night Headliner · May 15
              </p>
              <h2
                className="mt-4 text-4xl md:text-5xl lg:text-6xl"
                style={{ ...typography.headline, color: COLORS.white }}
              >
                See Gilligan Moss<br />live.
              </h2>
              <p
                className="mt-6"
                style={{ ...typography.body, color: COLORS.dustySky, fontSize: '16px', lineHeight: 1.7 }}
              >
                The mixtape is the warm-up. Friday night, they open the weekend —
                the set that sets the whole tone.
              </p>
              <p
                className="mt-4"
                style={{ ...typography.body, color: COLORS.dustySky, fontSize: '16px', lineHeight: 1.7 }}
              >
                700 people. Three days along the Example River. Music, food, sauna, and the kind
                of nights that feel like memories already.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/tickets"
                  className="px-7 py-4"
                  style={{
                    ...typography.button,
                    backgroundColor: COLORS.mustard,
                    color: COLORS.charcoal,
                  }}
                >
                  Get Tickets
                </Link>
                <Link
                  to="/lineup"
                  className="px-7 py-4"
                  style={{
                    ...typography.button,
                    backgroundColor: "transparent",
                    color: COLORS.white,
                    border: `1px solid ${COLORS.white}`,
                  }}
                >
                  See the Lineup
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default Mixtape;
