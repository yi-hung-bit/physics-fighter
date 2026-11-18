import React, { useState } from 'react';
import {
  BATTLE_STAGES,
  BRANCH_SPELLS,
  ELEMENT_LABELS,
  PRESET_SQUADS,
  SCIENTISTS,
  Scientist,
} from '../data/scientists';
import { audio } from '../utils/audio';
import { ScientistSprite } from './ScientistSprite';
import { RefreshCw, RotateCw, Shuffle, Swords, Volume2, VolumeX } from 'lucide-react';

export type BattleFormat = '3v3' | '1v1';
export type TurnMode = 'phase' | 'speed';
export type DifficultyLevel = 'easy' | 'normal' | 'hard';

interface PartySelectScreenProps {
  format: BattleFormat;
  setFormat: (f: BattleFormat) => void;
  turnMode: TurnMode;
  setTurnMode: (m: TurnMode) => void;
  difficulty: DifficultyLevel;
  setDifficulty: (d: DifficultyLevel) => void;
  stageId: 'academy' | 'chalkboard' | 'spacetime';
  setStageId: (id: 'academy' | 'chalkboard' | 'spacetime') => void;
  playerTeamIds: string[];
  setPlayerTeamIds: (ids: string[]) => void;
  enemyTeamIds: string[];
  setEnemyTeamIds: (ids: string[]) => void;
  muted: boolean;
  onToggleMute: () => void;
  onStartBattle: () => void;
}

export const PartySelectScreen: React.FC<PartySelectScreenProps> = ({
  format,
  setFormat,
  turnMode,
  setTurnMode,
  difficulty,
  setDifficulty,
  stageId,
  setStageId,
  playerTeamIds,
  setPlayerTeamIds,
  enemyTeamIds,
  setEnemyTeamIds,
  muted,
  onToggleMute,
  onStartBattle,
}) => {
  const [pageFilter, setPageFilter] = useState<'0' | '1' | '2' | 'all'>('0');
  const [assignSide, setAssignSide] = useState<'player' | 'enemy'>('player');
  const [assignSlot, setAssignSlot] = useState<number>(0);
  const [inspectedId, setInspectedId] = useState<string>(playerTeamIds[0] || 'newton');
  const [isFlipped, setIsFlipped] = useState<boolean>(false);

  const slotCount = format === '3v3' ? 3 : 1;
  const activePlayerIds = playerTeamIds.slice(0, slotCount);
  const activeEnemyIds = enemyTeamIds.slice(0, slotCount);

  const inspectedSci: Scientist =
    SCIENTISTS.find((s) => s.id === inspectedId) || SCIENTISTS[0];

  const visibleScientists =
    pageFilter === 'all'
      ? SCIENTISTS
      : SCIENTISTS.filter((s) => s.page === Number(pageFilter));

  const handleSelectScientist = (sci: Scientist) => {
    audio.playConfirm();
    setInspectedId(sci.id);
    setIsFlipped(false);

    if (assignSide === 'player') {
      const next = [...playerTeamIds];
      const existingIdx = next.slice(0, slotCount).indexOf(sci.id);
      if (existingIdx !== -1 && existingIdx !== assignSlot) {
        // Swap slots if already in party
        const temp = next[assignSlot];
        next[assignSlot] = sci.id;
        next[existingIdx] = temp;
      } else {
        next[assignSlot] = sci.id;
      }
      setPlayerTeamIds(next);
      if (slotCount > 1) {
        setAssignSlot((assignSlot + 1) % slotCount);
      }
    } else {
      const next = [...enemyTeamIds];
      const existingIdx = next.slice(0, slotCount).indexOf(sci.id);
      if (existingIdx !== -1 && existingIdx !== assignSlot) {
        const temp = next[assignSlot];
        next[assignSlot] = sci.id;
        next[existingIdx] = temp;
      } else {
        next[assignSlot] = sci.id;
      }
      setEnemyTeamIds(next);
      if (slotCount > 1) {
        setAssignSlot((assignSlot + 1) % slotCount);
      }
    }
  };

  const handleApplyPreset = (memberIds: [string, string, string]) => {
    audio.playConfirm();
    setPlayerTeamIds([...memberIds]);
    setInspectedId(memberIds[0]);
    setAssignSide('player');
    setAssignSlot(0);
  };

  const handleRandomizeRivals = () => {
    audio.playCursor();
    const pool = SCIENTISTS.filter((s) => !activePlayerIds.includes(s.id));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, 3).map((s) => s.id);
    setEnemyTeamIds(chosen);
    setInspectedId(chosen[0]);
  };

  const getPlayerSlotLabel = (id: string) => {
    const idx = activePlayerIds.indexOf(id);
    if (idx === -1) return null;
    return format === '3v3' ? `我方 #${idx + 1}` : '1P';
  };

  const getEnemySlotLabel = (id: string) => {
    const idx = activeEnemyIds.indexOf(id);
    if (idx === -1) return null;
    return format === '3v3' ? `敵方 #${idx + 1}` : 'CPU';
  };

  const branchSpell = BRANCH_SPELLS[inspectedSci.element];
  const elemMeta = ELEMENT_LABELS[inspectedSci.element];
  const derivedHp = 1100 + inspectedSci.power * 8 + inspectedSci.specialStat * 4;
  const derivedMp = 80 + Math.round(inspectedSci.specialStat * 0.7);

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 flex flex-col">
      {/* Clean 3-Zone Top Bar */}
      <header className="border-b border-slate-800/90 bg-[#080d1c]/95 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-3 whitespace-nowrap shrink-0">
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-wide text-amber-300">
              物理幻想：27 賢者戰紀
            </h1>
            <span className="hidden md:inline text-xs text-slate-400">
              Physics Fantasy · 攻防回合制對戰
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Format Toggle */}
            <div className="flex items-center p-1 bg-slate-900 border border-slate-700/80 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  audio.playCursor();
                  setFormat('3v3');
                  setAssignSlot(0);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  format === '3v3'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                3v3 小隊戰
              </button>
              <button
                type="button"
                onClick={() => {
                  audio.playCursor();
                  setFormat('1v1');
                  setAssignSlot(0);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  format === '1v1'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                1v1 宿敵單挑
              </button>
            </div>

            {/* Turn Rule Toggle */}
            <div className="flex items-center p-1 bg-slate-900 border border-slate-700/80 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  audio.playCursor();
                  setTurnMode('phase');
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  turnMode === 'phase'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="我方全員行動完畢後換敵方攻勢"
              >
                陣營輪流制
              </button>
              <button
                type="button"
                onClick={() => {
                  audio.playCursor();
                  setTurnMode('speed');
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  turnMode === 'speed'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="依科學家速度與加減速決定每次出手順序"
              >
                速度序列制
              </button>
            </div>

            {/* Difficulty */}
            <div className="flex items-center p-1 bg-slate-900 border border-slate-700/80 rounded-lg">
              {(['easy', 'normal', 'hard'] as DifficultyLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    audio.playCursor();
                    setDifficulty(lvl);
                  }}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    difficulty === lvl
                      ? 'bg-slate-200 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {lvl === 'easy' ? '見習' : lvl === 'normal' ? '教授' : '諾貝爾'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? '開啟音效' : '靜音'}
              className="p-2 rounded-lg border border-slate-700/80 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => {
                audio.playConfirm();
                onStartBattle();
              }}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-lg shadow-amber-500/20"
            >
              <Swords className="w-4 h-4" />
              <span>開始戰鬥</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: 27 Physicists Roster */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          {/* Era Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900/90 border border-slate-800 rounded-lg">
              {[
                { key: '0', label: '經典九傑 (1–9)' },
                { key: '1', label: '力學・熱學・電磁 (10–18)' },
                { key: '2', label: '光學・近代量子 (19–27)' },
                { key: 'all', label: '全部 27 人' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    audio.playCursor();
                    setPageFilter(tab.key as '0' | '1' | '2' | 'all');
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    pageFilter === tab.key
                      ? 'bg-slate-100 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-400 whitespace-nowrap">
              目前指派：
              <span className={assignSide === 'player' ? 'text-amber-300 font-bold ml-1' : 'text-rose-400 font-bold ml-1'}>
                {assignSide === 'player' ? '我方陣容' : '敵方陣容'}
                {format === '3v3' ? ` 第 ${assignSlot + 1} 位` : ''}
              </span>
            </div>
          </div>

          {/* Preset Squads Bar (shown in 3v3 mode) */}
          {format === '3v3' && (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 pb-3">
              <span className="text-xs text-slate-400 mr-1">推薦編隊：</span>
              {PRESET_SQUADS.map((sq) => (
                <button
                  key={sq.id}
                  type="button"
                  onClick={() => handleApplyPreset(sq.memberIds)}
                  className="px-2.5 py-1 text-xs rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title={sq.desc}
                >
                  {sq.name}
                </button>
              ))}
            </div>
          )}

          {/* Scientist Window Grid */}
          <div
            className={`grid gap-3 ${
              pageFilter === 'all'
                ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 max-h-[620px] overflow-y-auto pr-1'
                : 'grid-cols-2 sm:grid-cols-3'
            }`}
          >
            {visibleScientists.map((sci) => {
              const pTag = getPlayerSlotLabel(sci.id);
              const eTag = getEnemySlotLabel(sci.id);
              const isInspected = inspectedId === sci.id;
              const elem = ELEMENT_LABELS[sci.element];

              return (
                <button
                  key={sci.id}
                  type="button"
                  onClick={() => handleSelectScientist(sci)}
                  onMouseEnter={() => setInspectedId(sci.id)}
                  className={`group relative text-left rounded-xl p-3 border transition-all cursor-pointer flex flex-col gap-2 ${
                    isInspected
                      ? 'bg-[#101c3d] border-amber-400/90 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-900/75 border-slate-800 hover:border-slate-600 hover:bg-slate-900'
                  }`}
                >
                  {/* Top Metadata Row (Clean Unboxed Typography) */}
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span className="truncate font-medium" style={{ color: elem.color }}>
                      {elem.label} · {sci.roleTitle}
                    </span>
                    {(pTag || eTag) && (
                      <span
                        className={`font-bold whitespace-nowrap shrink-0 ${
                          pTag ? 'text-amber-300' : 'text-rose-400'
                        }`}
                      >
                        {pTag || eTag}
                      </span>
                    )}
                  </div>

                  {/* Portrait + Name */}
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-lg overflow-hidden border border-slate-700/80 bg-slate-950 shrink-0 flex items-center justify-center">
                      <ScientistSprite scientist={sci} portraitOnly size={56} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-slate-100 truncate">
                        {sci.name}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {sci.enName}
                      </div>
                      <div className="mt-1 font-mono-num text-[11px] text-emerald-300 truncate">
                        {sci.formula}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* RIGHT COLUMN: Party Lineup, Flippable Physgram Card, Stage Selector */}
        <aside className="lg:col-span-5 flex flex-col gap-4">
          {/* Party VS Lineup Window */}
          <div className="ff-window rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold text-slate-300">
                出戰陣容配置（點擊欄位即可替換該名角色）
              </div>
              <button
                type="button"
                onClick={handleRandomizeRivals}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-slate-900/80 hover:bg-slate-800 border border-slate-600/70 text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>隨機對手</span>
              </button>
            </div>

            <div className="grid grid-cols-11 gap-2 items-center">
              {/* Player Party Slots */}
              <div className="col-span-5 flex flex-col gap-1.5">
                <div className="text-[11px] font-bold text-amber-300 mb-0.5">
                  我方隊伍 ({format === '3v3' ? '3 名' : '1 名'})
                </div>
                {activePlayerIds.map((id, idx) => {
                  const s = SCIENTISTS.find((x) => x.id === id) || SCIENTISTS[0];
                  const active = assignSide === 'player' && assignSlot === idx;
                  return (
                    <button
                      key={`p-${idx}`}
                      type="button"
                      onClick={() => {
                        audio.playCursor();
                        setAssignSide('player');
                        setAssignSlot(idx);
                        setInspectedId(s.id);
                      }}
                      className={`flex items-center gap-2 p-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-amber-500/20 border-amber-400'
                          : 'bg-slate-950/60 border-slate-700/70 hover:border-slate-500'
                      }`}
                    >
                      <ScientistSprite scientist={s} portraitOnly size={34} className="rounded shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-100 truncate">{s.name}</div>
                        <div className="text-[10px] font-mono-num text-emerald-300 truncate">{s.formula}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* VS Divider */}
              <div className="col-span-1 flex items-center justify-center">
                <span className="font-display text-sm font-extrabold text-amber-400 italic">
                  VS
                </span>
              </div>

              {/* Enemy Party Slots */}
              <div className="col-span-5 flex flex-col gap-1.5">
                <div className="text-[11px] font-bold text-rose-400 mb-0.5">
                  CPU 對手 ({format === '3v3' ? '3 名' : '1 名'})
                </div>
                {activeEnemyIds.map((id, idx) => {
                  const s = SCIENTISTS.find((x) => x.id === id) || SCIENTISTS[6];
                  const active = assignSide === 'enemy' && assignSlot === idx;
                  return (
                    <button
                      key={`e-${idx}`}
                      type="button"
                      onClick={() => {
                        audio.playCursor();
                        setAssignSide('enemy');
                        setAssignSlot(idx);
                        setInspectedId(s.id);
                      }}
                      className={`flex items-center gap-2 p-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-rose-500/20 border-rose-400'
                          : 'bg-slate-950/60 border-slate-700/70 hover:border-slate-500'
                      }`}
                    >
                      <ScientistSprite scientist={s} portraitOnly size={34} className="rounded shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-100 truncate">{s.name}</div>
                        <div className="text-[10px] font-mono-num text-sky-300 truncate">{s.formula}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Inspected Scientist 3D Flip Card (RPG Stats <-> Physgram Trivia) */}
          <div className="flip-perspective">
            <div className={`flip-inner ${isFlipped ? 'is-flipped' : ''}`}>
              {/* Front Face: RPG Combat Sheet */}
              <div className="flip-face ff-window-dark rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-16 h-16 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0">
                      <ScientistSprite scientist={inspectedSci} size={64} pose="ready" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-amber-300 whitespace-nowrap">
                          {inspectedSci.name}
                        </h2>
                        <span className="text-xs text-slate-400 truncate">
                          {inspectedSci.enName} ({inspectedSci.years})
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 mt-0.5">
                        {inspectedSci.roleTitle} · {inspectedSci.field}
                      </div>
                      <div className="font-mono-num text-xs text-emerald-300 mt-1">
                        {inspectedSci.formula}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      audio.playCursor();
                      setIsFlipped(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/50 text-amber-300 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>冷知識</span>
                  </button>
                </div>

                {/* RPG Base Attributes */}
                <div className="grid grid-cols-5 gap-2 text-center border-b border-slate-800 pb-3 mb-3">
                  <div>
                    <div className="text-[11px] text-slate-400">HP</div>
                    <div className="font-mono-num text-sm font-bold text-emerald-300">{derivedHp}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">MP</div>
                    <div className="font-mono-num text-sm font-bold text-sky-300">{derivedMp}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">力量</div>
                    <div className="font-mono-num text-sm font-bold text-amber-300">{inspectedSci.power}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">速度</div>
                    <div className="font-mono-num text-sm font-bold text-cyan-300">{inspectedSci.speed}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">理論</div>
                    <div className="font-mono-num text-sm font-bold text-purple-300">{inspectedSci.specialStat}</div>
                  </div>
                </div>

                {/* Skills Breakdown */}
                <div className="space-y-2.5 text-xs">
                  <div>
                    <div className="flex items-center justify-between text-sky-300 font-bold">
                      <span>物理奧義：{inspectedSci.specialName}</span>
                      <span className="font-mono-num text-slate-300">{inspectedSci.specialMp} MP</span>
                    </div>
                    <p className="text-slate-400 mt-0.5 leading-relaxed">{inspectedSci.specialDesc}</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-emerald-300 font-bold">
                      <span>領域魔法：{branchSpell.name}</span>
                      <span className="font-mono-num text-slate-300">{branchSpell.mpCost} MP</span>
                    </div>
                    <p className="text-slate-400 mt-0.5 leading-relaxed">{branchSpell.desc}</p>
                  </div>

                  <div className="pt-1 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-amber-300 font-bold">
                      <span>極限奧義：{inspectedSci.superName}</span>
                      <span className="font-mono-num text-amber-200">100% 極限槽</span>
                    </div>
                    <p className="text-slate-400 mt-0.5 leading-relaxed">{inspectedSci.superDesc}</p>
                  </div>
                </div>
              </div>

              {/* Back Face: Physgram Trivia & Quote */}
              <div className="flip-face flip-face-back absolute inset-0 ff-window-dark rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <div className="text-xs text-amber-400 font-semibold">
                        Physgram 科學家冷知識
                      </div>
                      <h3 className="text-lg font-bold text-slate-100 mt-0.5">
                        {inspectedSci.name} · {inspectedSci.enName}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        audio.playCursor();
                        setIsFlipped(false);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>返回數值</span>
                    </button>
                  </div>

                  <blockquote className="text-sm text-amber-200/95 font-medium leading-relaxed mb-4">
                    {inspectedSci.quote}
                  </blockquote>

                  <p className="text-sm text-slate-300 leading-relaxed">
                    {inspectedSci.trivia}
                  </p>
                </div>

                <div className="text-xs text-slate-400 border-t border-slate-800 pt-3 flex items-center justify-between">
                  <span>代表公式：{inspectedSci.formula}</span>
                  <span>{inspectedSci.eraTag}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stage Selector */}
          <div className="ff-window-dark rounded-xl p-3.5">
            <div className="text-xs font-semibold text-slate-300 mb-2.5">
              選擇戰鬥舞台
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {BATTLE_STAGES.map((st) => {
                const selected = stageId === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      audio.playCursor();
                      setStageId(st.id);
                    }}
                    className={`group rounded-lg overflow-hidden border text-left transition-all cursor-pointer ${
                      selected
                        ? 'border-amber-400 ring-1 ring-amber-400/60'
                        : 'border-slate-800 hover:border-slate-600 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="relative h-16 w-full bg-slate-950 overflow-hidden">
                      <img
                        src={st.imageUrl}
                        alt={st.name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-1 left-1.5 right-1.5 text-[11px] font-bold text-slate-100 truncate">
                        {st.name}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};
