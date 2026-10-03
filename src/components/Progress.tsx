import { useState } from "react";
import { TEAMS, TOWERS, type TowerId } from "@/game/balance";
import {
  DEEDS,
  readLedger,
  spendTrain,
  trainCost,
  trainOf,
  type TrainStat,
} from "@/game/ledger";
import { CHAPTERS, canPlayChapter, chapterPlace } from "@/game/story";

export function StoryPanel({
  onBack,
  onStart,
}: {
  onBack: () => void;
  onStart: (index: number) => void;
}) {
  const book = readLedger();
  const next = Math.min(book.cleared, CHAPTERS.length - 1);
  const [pick, setPick] = useState(next);
  const [list, setList] = useState(false);
  const chapter = CHAPTERS[pick];
  const open = canPlayChapter(pick);
  return (
    <div>
      <button id="story-back" type="button" className="min-h-11 rounded-lg px-1 text-sm text-muted" onClick={onBack}>
        Back
      </button>
      <h2 className="mt-3 font-display text-4xl leading-tight text-fg">The case</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        It starts on a gold dot and walks out of Chicago. Each chapter swears a new craft, and a few of them a new road.
        Favors from a first clear can train a tower later.
      </p>
      <p className="mt-4 text-sm text-primary">{book.favors} {book.favors === 1 ? "favor" : "favors"} on the shelf</p>
      {chapter ? (
        <div className="mt-4 rounded-xl border border-primary bg-surface-2 p-3">
          <p className="text-xs tracking-widest text-muted">{chapter.kicker}</p>
          <p className="mt-1 font-display text-2xl leading-tight">{chapter.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{chapter.blurb}</p>
          <button
            id="story-start"
            type="button"
            disabled={!open}
            className="mt-3 min-h-12 w-full rounded-xl bg-primary font-semibold text-primary-fg disabled:opacity-40"
            onClick={() => onStart(pick)}
          >
            {pick < book.cleared ? "Walk it again" : "Begin this chapter"}
          </button>
        </div>
      ) : null}
      <button
        id="story-list"
        type="button"
        className="mt-4 min-h-11 text-sm text-muted"
        onClick={() => setList((openList) => !openList)}
      >
        {list ? "Hide the other chapters" : "Other chapters"}
      </button>
      {list ? (
      <div className="mt-2 grid gap-2">
        {CHAPTERS.map((row, index) => {
          const shut = index > book.cleared;
          const done = index < book.cleared;
          const on = index === pick;
          return (
            <button
              key={row.title}
              id={`chapter-${index}`}
              type="button"
              disabled={shut}
              aria-pressed={on}
              className={`min-h-11 rounded-xl border p-3 text-left disabled:opacity-40 ${on ? "border-primary bg-surface-2" : "border-line bg-surface"}`}
              onClick={() => setPick(index)}
            >
              <span className="font-display text-lg leading-tight">{row.title}</span>
              <span className="mt-1 block text-sm text-muted">
                {row.kicker}
                {done ? " · walked" : shut ? " · shut" : " · next"}
                {" · "}
                {chapterPlace(index)}
              </span>
            </button>
          );
        })}
      </div>
      ) : null}
    </div>
  );
}

const STATS: { id: TrainStat; label: string }[] = [
  { id: "dmg", label: "Damage" },
  { id: "rate", label: "Rate" },
  { id: "range", label: "Reach" },
];

export function TrainPanel({ onBack }: { onBack: () => void }) {
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const book = readLedger();
  void tick;
  const towers = book.towers.filter((id): id is TowerId => id in TOWERS);
  return (
    <div>
      <button id="train-back" type="button" className="min-h-11 rounded-lg px-1 text-sm text-muted" onClick={onBack}>
        Back
      </button>
      <h2 className="mt-3 font-display text-4xl leading-tight text-fg">Training</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        A finished night pays one favor. Honing a defender pays one. Breaking another court pays two. Deeds pay more, once. Each rank is eight percent, or six on reach, and it stacks on whatever you hone in the street.
      </p>
      <p className="mt-4 text-sm text-primary">{book.favors} {book.favors === 1 ? "favor" : "favors"}</p>
      <div className="mt-4 grid gap-3">
        {towers.map((kind) => {
          const def = TOWERS[kind];
          const row = trainOf(kind);
          return (
            <div key={kind} className="rounded-xl border border-line bg-surface p-3">
              <p className="font-display text-lg leading-tight">{def.name}</p>
              <p className="text-sm text-muted">{TEAMS[def.team].name}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {STATS.map((stat) => {
                  const rank = row[stat.id];
                  const cost = trainCost(rank);
                  return (
                    <button
                      key={stat.id}
                      id={`train-${kind}-${stat.id}`}
                      type="button"
                      disabled={cost == null || book.favors < cost}
                      className="min-h-11 rounded-lg border border-line px-2 text-left text-sm disabled:opacity-40"
                      onClick={() => {
                        const reason = spendTrain(kind, stat.id);
                        setError(reason ?? "");
                        setTick((n) => n + 1);
                      }}
                    >
                      <span className="block font-semibold">{stat.label}</span>
                      <span className="text-muted">{rank}/3{cost == null ? " · finished" : ` · ${cost} ${cost === 1 ? "favor" : "favors"}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

export function DeedsPanel({ onBack }: { onBack: () => void }) {
  const book = readLedger();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = DEEDS.find((deed) => deed.id === openId) ?? null;
  const unlocked = book.deeds.length;
  const done = open != null && book.deeds.includes(open.id);

  return (
    <div>
      <button
        id="deeds-back"
        type="button"
        className="min-h-11 rounded-lg px-1 text-sm text-muted"
        onClick={open ? () => setOpenId(null) : onBack}
      >
        {open ? "All deeds" : "Back"}
      </button>
      <h2 className="mt-3 font-display text-4xl leading-tight text-fg">Deeds</h2>
      <p className="mt-2 text-sm text-muted">
        {unlocked} of {DEEDS.length} unlocked on this device. Not a ranking.
      </p>
      {open ? (
        <article className={`mt-4 rounded-2xl border p-5 ${done ? "border-primary bg-surface-2" : "border-line bg-surface"}`}>
          <p className="text-xs tracking-widest text-primary">{done ? "Unlocked" : "Not yet"}</p>
          <h3 className="mt-2 font-display text-3xl leading-tight">{open.name}</h3>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-fg">{open.detail}</p>
          <p className="mt-3 text-sm text-primary">
            {done
              ? `This deed paid ${open.favors} ${open.favors === 1 ? "favor" : "favors"}.`
              : `Unlocking this puts ${open.favors} ${open.favors === 1 ? "favor" : "favors"} on the shelf.`}
          </p>
        </article>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DEEDS.map((deed) => {
            const held = book.deeds.includes(deed.id);
            return (
              <button
                key={deed.id}
                id={`deed-${deed.id}`}
                type="button"
                className={`min-h-20 rounded-xl border px-3 py-2 text-left ${held ? "border-primary bg-surface-2" : "border-line bg-surface"}`}
                onClick={() => setOpenId(deed.id)}
              >
                <span className="block font-display text-base leading-tight">{deed.name}</span>
                <span className="mt-1 block text-xs text-muted">
                  {held ? "Unlocked" : "Not yet"} · {deed.favors} {deed.favors === 1 ? "favor" : "favors"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
