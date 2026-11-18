import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BATTLE_ITEMS,
  BATTLE_STAGES,
  BRANCH_SPELLS,
  BattleItem,
  ELEMENT_LABELS,
  SCIENTISTS,
  Scientist,
} from '../data/scientists';
import { audio } from '../utils/audio';
import { BattleVfxCanvas, VfxEvent } from './BattleVfxCanvas';
import { ScientistSprite, SpritePose } from './ScientistSprite';
import { ArrowLeft, RotateCcw, Shield, Sparkles, Swords, Volume2, VolumeX } from 'lucide-react';
import { BattleFormat, DifficultyLevel, TurnMode } from './PartySelectScreen';

interface StatusEffects {
  shieldTurns: number;
  reflectTurns: number;
  hasteTurns: number;
  slowTurns: number;
  poisonTurns: number;
  evasionTurns: number;
  defBreakTurns: number;
  blindTurns: number;
}

interface Combatant {
  uid: string;
  side: 'player' | 'enemy';
  slotIndex: number;
  sci: Scientist;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  /** Used in 'speed' CTB turn-order mode (0..1000 discrete jumps) */
  ctbGauge: number;
  /** Used in 'phase' turn-based mode */
  actedThisPhase: boolean;
  limit: number;
  pose: SpritePose;
  guarding: boolean;
  statuses: StatusEffects;
}

interface FloatingNumber {
  id: number;
  xPct: number;
  yPct: number;
  text: string;
  subText?: string;
  tone: 'damage' | 'crit' | 'heal' | 'mp' | 'status' | 'miss';
}

type CommandMenuView = 'root' | 'skills' | 'items' | 'target';

interface PendingAction {
  kind: 'attack' | 'special' | 'branch' | 'super' | 'item';
  label: string;
  targetType: 'enemy' | 'all_enemies' | 'ally' | 'all_allies' | 'self' | 'ko_ally';
  itemId?: BattleItem['id'];
}

interface BattleArenaProps {
  format: BattleFormat;
  turnMode: TurnMode;
  difficulty: DifficultyLevel;
  stageId: 'academy' | 'chalkboard' | 'spacetime';
  playerTeamIds: string[];
  enemyTeamIds: string[];
  muted: boolean;
  onToggleMute: () => void;
  onReturnToSelect: () => void;
}

const EMPTY_STATUS: StatusEffects = {
  shieldTurns: 0,
  reflectTurns: 0,
  hasteTurns: 0,
  slowTurns: 0,
  poisonTurns: 0,
  evasionTurns: 0,
  defBreakTurns: 0,
  blindTurns: 0,
};

function createCombatant(
  sci: Scientist,
  side: 'player' | 'enemy',
  slotIndex: number,
  format: BattleFormat,
  difficulty: DifficultyLevel
): Combatant {
  const duelMult = format === '1v1' ? 1.45 : 1;
  const enemyDiffHpMult =
    side === 'enemy' ? (difficulty === 'easy' ? 0.82 : difficulty === 'hard' ? 1.22 : 1.0) : 1.0;
  const maxHp = Math.round((1100 + sci.power * 8 + sci.specialStat * 4) * duelMult * enemyDiffHpMult);
  const maxMp = 80 + Math.round(sci.specialStat * 0.7);
  // Slight initial head start for player side in speed mode
  const initialCtb = sci.speed * 4 + (side === 'player' ? 140 : 60) - slotIndex * 18;

  return {
    uid: `${side[0]}${slotIndex}`,
    side,
    slotIndex,
    sci,
    hp: maxHp,
    maxHp,
    mp: maxMp,
    maxMp,
    ctbGauge: Math.max(0, initialCtb),
    actedThisPhase: false,
    limit: 0,
    pose: 'idle',
    guarding: false,
    statuses: { ...EMPTY_STATUS },
  };
}

function getSlotCoords(side: 'player' | 'enemy', slotIndex: number, format: BattleFormat): { x: number; y: number } {
  if (format === '1v1') {
    return side === 'enemy' ? { x: 260, y: 350 } : { x: 740, y: 350 };
  }
  const enemyPts = [
    { x: 215, y: 265 },
    { x: 285, y: 345 },
    { x: 215, y: 425 },
  ];
  const playerPts = [
    { x: 785, y: 265 },
    { x: 715, y: 345 },
    { x: 785, y: 425 },
  ];
  return side === 'enemy' ? enemyPts[slotIndex] : playerPts[slotIndex];
}

function getElementMultiplier(attacker: Scientist['element'], defender: Scientist['element']): number {
  return ELEMENT_LABELS[defender].weakTo === attacker ? 1.25 : 1.0;
}

function getEffectiveSpeed(c: Combatant): number {
  const hasteMult = c.statuses.hasteTurns > 0 ? 1.4 : 1.0;
  const slowMult = c.statuses.slowTurns > 0 ? 0.55 : 1.0;
  return Math.max(20, c.sci.speed * hasteMult * slowMult);
}

/** Pure discrete CTB simulation: advances gauges until next alive combatant reaches 1000 */
function advanceToNextCtbActor(roster: Combatant[]): { nextUid: string | null; updated: Combatant[] } {
  const alive = roster.filter((c) => c.hp > 0);
  if (alive.length === 0) return { nextUid: null, updated: roster };

  let minTicks = Infinity;
  for (const c of alive) {
    const spd = getEffectiveSpeed(c);
    const remaining = Math.max(0, 1000 - c.ctbGauge);
    const ticks = remaining / spd;
    if (ticks < minTicks) minTicks = ticks;
  }

  let pickedUid: string | null = null;
  let bestGauge = -1;

  const updated = roster.map((c) => {
    if (c.hp <= 0) return c;
    const nextGauge = c.ctbGauge + getEffectiveSpeed(c) * minTicks;
    if (nextGauge >= 999.9) {
      const score = nextGauge + (c.side === 'player' ? 0.05 : 0);
      if (score > bestGauge) {
        bestGauge = score;
        pickedUid = c.uid;
      }
    }
    return { ...c, ctbGauge: Math.min(1000, nextGauge) };
  });

  return { nextUid: pickedUid, updated };
}

/** Computes upcoming 6 turn slots for the CTB Turn Order Timeline */
function previewUpcomingOrder(roster: Combatant[], activeUid: string | null, steps = 6): Combatant[] {
  const sim = roster.map((c) => ({ ...c, statuses: { ...c.statuses } }));
  const result: Combatant[] = [];

  if (activeUid) {
    const first = sim.find((c) => c.uid === activeUid && c.hp > 0);
    if (first) {
      result.push(first);
      first.ctbGauge = 0;
    }
  }

  while (result.length < steps) {
    const alive = sim.filter((c) => c.hp > 0);
    if (alive.length === 0) break;
    let minTicks = Infinity;
    for (const c of alive) {
      const ticks = Math.max(0, 1000 - c.ctbGauge) / getEffectiveSpeed(c);
      if (ticks < minTicks) minTicks = ticks;
    }
    let chosen: Combatant | null = null;
    let bestScore = -1;
    for (const c of alive) {
      c.ctbGauge = c.ctbGauge + getEffectiveSpeed(c) * minTicks;
      if (c.ctbGauge >= 999.9) {
        const score = c.ctbGauge + (c.side === 'player' ? 0.05 : 0);
        if (score > bestScore) {
          bestScore = score;
          chosen = c;
        }
      }
    }
    if (!chosen) break;
    result.push({ ...chosen });
    chosen.ctbGauge = 0;
  }

  return result;
}

export const BattleArena: React.FC<BattleArenaProps> = ({
  format,
  turnMode,
  difficulty,
  stageId,
  playerTeamIds,
  enemyTeamIds,
  muted,
  onToggleMute,
  onReturnToSelect,
}) => {
  const stage = useMemo(
    () => BATTLE_STAGES.find((s) => s.id === stageId) || BATTLE_STAGES[0],
    [stageId]
  );

  const count = format === '3v3' ? 3 : 1;

  const initMatchState = useCallback(() => {
    const pList = playerTeamIds.slice(0, count).map((id, idx) => {
      const sci = SCIENTISTS.find((s) => s.id === id) || SCIENTISTS[idx];
      return createCombatant(sci, 'player', idx, format, difficulty);
    });
    const eList = enemyTeamIds.slice(0, count).map((id, idx) => {
      const sci = SCIENTISTS.find((s) => s.id === id) || SCIENTISTS[(idx + 6) % SCIENTISTS.length];
      return createCombatant(sci, 'enemy', idx, format, difficulty);
    });
    const combined = [...pList, ...eList];

    if (turnMode === 'phase') {
      return {
        roster: combined.map((c, i) =>
          i === 0 ? { ...c, pose: 'ready' as SpritePose } : c
        ),
        activeUid: pList[0].uid,
        phase: 'player' as const,
      };
    } else {
      const { nextUid, updated } = advanceToNextCtbActor(combined);
      return {
        roster: updated.map((c) =>
          c.uid === nextUid && c.side === 'player' ? { ...c, pose: 'ready' as SpritePose } : c
        ),
        activeUid: nextUid,
        phase: 'player' as const,
      };
    }
  }, [playerTeamIds, enemyTeamIds, count, format, difficulty, turnMode]);

  const initialData = useMemo(() => initMatchState(), [initMatchState]);

  const [combatants, setCombatants] = useState<Combatant[]>(initialData.roster);
  const combatantsRef = useRef<Combatant[]>(combatants);
  combatantsRef.current = combatants;

  const [roundNum, setRoundNum] = useState<number>(1);
  const [phase, setPhase] = useState<'player' | 'enemy'>(initialData.phase);
  const [activeActorUid, setActiveActorUid] = useState<string | null>(initialData.activeUid);
  const [menuView, setMenuView] = useState<CommandMenuView>('root');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [itemCounts, setItemCounts] = useState<Record<BattleItem['id'], number>>({
    apple_potion: 4,
    quantum_ether: 3,
    planck_revive: 2,
    calibration_kit: 2,
  });

  const [bannerText, setBannerText] = useState<string>(
    turnMode === 'phase'
      ? '第 1 回合・我方進攻階段！請選擇攻防指令'
      : '第 1 回合開始！依科學家速度順序展開回合攻防'
  );
  const [vfxEvents, setVfxEvents] = useState<VfxEvent[]>([]);
  const [floatingNums, setFloatingNums] = useState<FloatingNumber[]>([]);
  const [cutIn, setCutIn] = useState<{ sci: Scientist; superName: string } | null>(null);
  const [outcome, setOutcome] = useState<'victory' | 'defeat' | null>(null);
  const [stats, setStats] = useState({ turns: 0, maxHit: 0, totalDamage: 0 });
  const [stageShake, setStageShake] = useState(false);

  const isBusyRef = useRef(false);
  const outcomeRef = useRef<'victory' | 'defeat' | null>(null);
  outcomeRef.current = outcome;
  const nextIdRef = useRef(1);
  const timersRef = useRef<number[]>([]);

  const scheduleTimeout = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  const spawnFloating = useCallback(
    (
      target: Combatant,
      text: string,
      tone: FloatingNumber['tone'],
      subText?: string,
      yOffset = -10
    ) => {
      const coords = getSlotCoords(target.side, target.slotIndex, format);
      const id = nextIdRef.current++;
      const xPct = (coords.x / 1000) * 100;
      const yPct = ((coords.y + yOffset - 40) / 560) * 100;
      setFloatingNums((prev) => [...prev, { id, xPct, yPct, text, subText, tone }]);
      scheduleTimeout(() => {
        setFloatingNums((prev) => prev.filter((f) => f.id !== id));
      }, 1180);
    },
    [format, scheduleTimeout]
  );

  const spawnVfx = useCallback(
    (
      kind: VfxEvent['kind'],
      from: Combatant,
      to: Combatant,
      color: string,
      formula?: string,
      durationMs = 620
    ) => {
      const fromPt = getSlotCoords(from.side, from.slotIndex, format);
      const toPt = getSlotCoords(to.side, to.slotIndex, format);
      const id = nextIdRef.current++;
      const ev: VfxEvent = {
        id,
        kind,
        element: from.sci.element,
        fromX: fromPt.x,
        fromY: fromPt.y - 38,
        toX: toPt.x,
        toY: toPt.y - 38,
        color,
        formula,
        createdAt: performance.now(),
        durationMs,
      };
      setVfxEvents((prev) => [...prev, ev]);
      scheduleTimeout(() => {
        setVfxEvents((prev) => prev.filter((e) => e.id !== id));
      }, durationMs + 60);
    },
    [format, scheduleTimeout]
  );

  const triggerShake = useCallback(() => {
    setStageShake(true);
    scheduleTimeout(() => setStageShake(false), 260);
  }, [scheduleTimeout]);

  const checkOutcome = useCallback((roster: Combatant[]): boolean => {
    const enemiesAlive = roster.some((c) => c.side === 'enemy' && c.hp > 0);
    const playersAlive = roster.some((c) => c.side === 'player' && c.hp > 0);
    if (!enemiesAlive) {
      setOutcome('victory');
      setActiveActorUid(null);
      setBannerText('戰鬥勝利！敵方物理理論已全面突破！');
      audio.playVictoryFanfare();
      return true;
    }
    if (!playersAlive) {
      setOutcome('defeat');
      setActiveActorUid(null);
      setBannerText('全軍覆沒…重新調整攻防陣容再戰！');
      audio.playDefeat();
      return true;
    }
    return false;
  }, []);

  // Forward declarations via ref for mutual recursion between advanceTurn & triggerCpuTurn
  const triggerCpuTurnRef = useRef<(enemy: Combatant, roster: Combatant[]) => void>(() => {});

  const advanceToNextTurn = useCallback(
    (rosterAfterAction: Combatant[], currentPhase: 'player' | 'enemy', currentRound: number) => {
      if (checkOutcome(rosterAfterAction)) {
        isBusyRef.current = false;
        return;
      }

      if (turnMode === 'phase') {
        if (currentPhase === 'player') {
          const nextUnactedPlayer = rosterAfterAction.find(
            (c) => c.side === 'player' && c.hp > 0 && !c.actedThisPhase
          );
          if (nextUnactedPlayer) {
            setCombatants(
              rosterAfterAction.map((c) =>
                c.uid === nextUnactedPlayer.uid ? { ...c, pose: 'ready' } : c
              )
            );
            setActiveActorUid(nextUnactedPlayer.uid);
            setMenuView('root');
            setPendingAction(null);
            setBannerText(`第 ${currentRound} 回合・輪到「${nextUnactedPlayer.sci.name}」下達指令`);
            isBusyRef.current = false;
            return;
          }

          // All players acted -> switch to Enemy Phase!
          const resetEnemies = rosterAfterAction.map((c) =>
            c.side === 'enemy'
              ? { ...c, actedThisPhase: false, guarding: false }
              : c
          );
          const firstEnemy = resetEnemies.find((c) => c.side === 'enemy' && c.hp > 0);
          if (firstEnemy) {
            setPhase('enemy');
            setActiveActorUid(firstEnemy.uid);
            setCombatants(resetEnemies);
            setBannerText(`第 ${currentRound} 回合・敵方攻勢階段！準備迎戰「${firstEnemy.sci.name}」`);
            scheduleTimeout(() => {
              triggerCpuTurnRef.current(firstEnemy, resetEnemies);
            }, 600);
          }
          return;
        } else {
          // Enemy Phase: check if another enemy still needs to act
          const nextUnactedEnemy = rosterAfterAction.find(
            (c) => c.side === 'enemy' && c.hp > 0 && !c.actedThisPhase
          );
          if (nextUnactedEnemy) {
            setActiveActorUid(nextUnactedEnemy.uid);
            setBannerText(`第 ${currentRound} 回合・敵方「${nextUnactedEnemy.sci.name}」準備行動！`);
            scheduleTimeout(() => {
              triggerCpuTurnRef.current(nextUnactedEnemy, rosterAfterAction);
            }, 600);
            return;
          }

          // Both sides finished -> Start Next Round (Player Phase)!
          const nextRound = currentRound + 1;
          const preparedRoster = rosterAfterAction.map((c) => {
            if (c.hp <= 0) return { ...c, pose: 'ko' as SpritePose };
            if (c.side === 'player') {
              return {
                ...c,
                actedThisPhase: false,
                guarding: false,
                pose: 'idle' as SpritePose,
              };
            }
            return { ...c, actedThisPhase: false };
          });
          const firstPlayer = preparedRoster.find((c) => c.side === 'player' && c.hp > 0);
          setRoundNum(nextRound);
          setPhase('player');
          if (firstPlayer) {
            setCombatants(
              preparedRoster.map((c) =>
                c.uid === firstPlayer.uid ? { ...c, pose: 'ready' } : c
              )
            );
            setActiveActorUid(firstPlayer.uid);
            setMenuView('root');
            setPendingAction(null);
            setBannerText(`第 ${nextRound} 回合・我方進攻階段！「${firstPlayer.sci.name}」待命中`);
          }
          isBusyRef.current = false;
          return;
        }
      } else {
        // 'speed' CTB Strict Turn-Order mode
        const { nextUid, updated } = advanceToNextCtbActor(rosterAfterAction);
        const nextActor = updated.find((c) => c.uid === nextUid);
        if (!nextActor) {
          isBusyRef.current = false;
          return;
        }

        const nextRound = currentRound + (nextActor.side === 'player' ? 0 : 0);
        setRoundNum((r) => (nextActor.slotIndex === 0 && nextActor.side === 'player' ? r + 1 : r));

        if (nextActor.side === 'player') {
          setPhase('player');
          setCombatants(
            updated.map((c) =>
              c.uid === nextActor.uid
                ? { ...c, guarding: false, pose: 'ready' as SpritePose }
                : c
            )
          );
          setActiveActorUid(nextActor.uid);
          setMenuView('root');
          setPendingAction(null);
          setBannerText(`輪到我方「${nextActor.sci.name}」行動！（速度順位）`);
          isBusyRef.current = false;
        } else {
          setPhase('enemy');
          setCombatants(
            updated.map((c) => (c.uid === nextActor.uid ? { ...c, guarding: false } : c))
          );
          setActiveActorUid(nextActor.uid);
          setBannerText(`敵方「${nextActor.sci.name}」取得行動順位！`);
          scheduleTimeout(() => {
            triggerCpuTurnRef.current(nextActor, updated);
          }, 600);
        }
        void nextRound;
      }
    },
    [checkOutcome, scheduleTimeout, turnMode]
  );

  // If turnMode is 'speed' and the very first actor happens to be an enemy, trigger them once
  useEffect(() => {
    if (turnMode === 'speed' && initialData.activeUid) {
      const first = initialData.roster.find((c) => c.uid === initialData.activeUid);
      if (first && first.side === 'enemy') {
        isBusyRef.current = true;
        setPhase('enemy');
        setBannerText(`敵方「${first.sci.name}」先攻！`);
        scheduleTimeout(() => {
          triggerCpuTurnRef.current(first, initialData.roster);
        }, 650);
      }
    }
  }, [initialData, scheduleTimeout, turnMode]);

  // Core Action Executor
  const executeCombatAction = useCallback(
    (actorUid: string, action: PendingAction, explicitTargetUid?: string) => {
      if (outcomeRef.current) return;
      const rosterNow = combatantsRef.current;
      const actor = rosterNow.find((c) => c.uid === actorUid);
      if (!actor || actor.hp <= 0) return;

      isBusyRef.current = true;
      setMenuView('root');
      setPendingAction(null);

      // Start-of-turn Poison / Radiation DoT
      let poisonNote = '';
      if (actor.statuses.poisonTurns > 0) {
        const dot = Math.max(45, Math.round(actor.maxHp * 0.08));
        const nextHp = Math.max(1, actor.hp - dot);
        spawnFloating(actor, `-${dot}`, 'status', '輻射衰變');
        poisonNote = `（受輻射衰變扣血 ${dot}）`;
        setCombatants((prev) =>
          prev.map((c) => (c.uid === actor.uid ? { ...c, hp: nextHp } : c))
        );
      }

      const isSuper = action.kind === 'super';
      const isItem = action.kind === 'item';
      const isBranch = action.kind === 'branch';
      const isSpecial = action.kind === 'special';

      setBannerText(`${actor.sci.name} 發動《${action.label}》！${poisonNote}`);

      const runResolution = () => {
        const current = [...combatantsRef.current];
        const casterIdx = current.findIndex((c) => c.uid === actorUid);
        if (casterIdx === -1) {
          isBusyRef.current = false;
          return;
        }

        const caster = { ...current[casterIdx], statuses: { ...current[casterIdx].statuses } };
        caster.guarding = false;
        caster.actedThisPhase = true;
        caster.ctbGauge = 0;

        // Tick down caster's active status durations
        (Object.keys(caster.statuses) as (keyof StatusEffects)[]).forEach((k) => {
          if (caster.statuses[k] > 0) caster.statuses[k] -= 1;
        });

        const branchSpell = BRANCH_SPELLS[caster.sci.element];
        if (isSpecial) {
          caster.mp = Math.max(0, caster.mp - caster.sci.specialMp);
        } else if (isBranch) {
          caster.mp = Math.max(0, caster.mp - branchSpell.mpCost);
        } else if (isSuper) {
          caster.limit = 0;
        } else if (action.kind === 'attack') {
          caster.mp = Math.min(caster.maxMp, caster.mp + 6);
          caster.limit = Math.min(100, caster.limit + 22);
        }

        if (isItem && action.itemId) {
          setItemCounts((prev) => ({
            ...prev,
            [action.itemId!]: Math.max(0, prev[action.itemId!] - 1),
          }));
        }

        caster.pose = action.kind === 'attack' ? 'attack' : 'cast';
        current[casterIdx] = caster;

        const opposingSide = caster.side === 'player' ? 'enemy' : 'player';
        const sameSide = caster.side;

        const getAlive = (side: 'player' | 'enemy') =>
          current.filter((c) => c.side === side && c.hp > 0);

        let targets: Combatant[] = [];
        if (action.targetType === 'all_enemies') {
          targets = getAlive(opposingSide);
        } else if (action.targetType === 'all_allies') {
          targets = getAlive(sameSide);
        } else if (action.targetType === 'self') {
          targets = [caster];
        } else if (action.targetType === 'ko_ally') {
          const koTarget = current.find((c) => c.uid === explicitTargetUid && c.hp <= 0);
          targets = koTarget ? [koTarget] : current.filter((c) => c.side === sameSide && c.hp <= 0).slice(0, 1);
        } else if (action.targetType === 'ally') {
          const ally = current.find((c) => c.uid === explicitTargetUid && c.hp > 0);
          targets = ally ? [ally] : getAlive(sameSide).slice(0, 1);
        } else {
          const enemy = current.find((c) => c.uid === explicitTargetUid && c.hp > 0);
          targets = enemy ? [enemy] : getAlive(opposingSide).slice(0, 1);
        }

        let actionDamageTotal = 0;
        let highestHit = 0;

        if (isItem && action.itemId) {
          audio.playHeal();
          targets.forEach((t) => {
            const idx = current.findIndex((c) => c.uid === t.uid);
            if (idx === -1) return;
            const target = { ...current[idx], statuses: { ...current[idx].statuses } };
            spawnVfx('heal', caster, target, '#34d399');
            if (action.itemId === 'apple_potion') {
              const heal = Math.round(target.maxHp * 0.5);
              target.hp = Math.min(target.maxHp, target.hp + heal);
              spawnFloating(target, `+${heal} HP`, 'heal');
            } else if (action.itemId === 'quantum_ether') {
              const mpGain = 55;
              target.mp = Math.min(target.maxMp, target.mp + mpGain);
              spawnFloating(target, `+${mpGain} MP`, 'mp');
            } else if (action.itemId === 'planck_revive') {
              const heal = Math.round(target.maxHp * 0.45);
              target.hp = heal;
              target.pose = 'idle';
              target.ctbGauge = 450;
              spawnFloating(target, `復活 +${heal}`, 'heal');
            } else if (action.itemId === 'calibration_kit') {
              target.statuses.slowTurns = 0;
              target.statuses.poisonTurns = 0;
              target.statuses.blindTurns = 0;
              target.statuses.defBreakTurns = 0;
              target.limit = Math.min(100, target.limit + 35);
              spawnFloating(target, '+35% 極限', 'status', '狀態淨化');
            }
            current[idx] = target;
          });
        } else if (isBranch) {
          if (branchSpell.kind === 'blind') {
            audio.playSpell();
            targets.forEach((t) => {
              const idx = current.findIndex((c) => c.uid === t.uid);
              if (idx === -1) return;
              const target = { ...current[idx], statuses: { ...current[idx].statuses } };
              const dmg = Math.round((150 + caster.sci.specialStat * 2.2) * (0.94 + Math.random() * 0.12));
              target.hp = Math.max(0, target.hp - dmg);
              target.pose = target.hp === 0 ? 'ko' : 'hurt';
              target.statuses.blindTurns = 2;
              actionDamageTotal += dmg;
              highestHit = Math.max(highestHit, dmg);
              spawnVfx('spell', caster, target, '#34d399');
              spawnFloating(target, `-${dmg}`, 'damage', '致盲');
              current[idx] = target;
            });
          } else {
            audio.playHeal();
            targets.forEach((t) => {
              const idx = current.findIndex((c) => c.uid === t.uid);
              if (idx === -1) return;
              const target = { ...current[idx], statuses: { ...current[idx].statuses } };
              spawnVfx(branchSpell.kind === 'shield' ? 'shield' : 'heal', caster, target, '#38bdf8');
              if (branchSpell.kind === 'haste') {
                target.ctbGauge = Math.min(950, target.ctbGauge + 450);
                target.statuses.hasteTurns = 2;
                spawnFloating(target, '加速!', 'status', '順位提前');
              } else if (branchSpell.kind === 'heal') {
                const heal = Math.round(target.maxHp * 0.42);
                target.hp = Math.min(target.maxHp, target.hp + heal);
                target.statuses.poisonTurns = 0;
                target.statuses.slowTurns = 0;
                spawnFloating(target, `+${heal} HP`, 'heal');
              } else if (branchSpell.kind === 'shield') {
                target.statuses.shieldTurns = 2;
                spawnFloating(target, '護盾!', 'status', '減傷 38%');
              } else if (branchSpell.kind === 'regen') {
                const heal = Math.round(target.maxHp * 0.24);
                target.hp = Math.min(target.maxHp, target.hp + heal);
                target.mp = Math.min(target.maxMp, target.mp + 15);
                spawnFloating(target, `+${heal} HP`, 'heal', '+15 MP');
              }
              current[idx] = target;
            });
          }
        } else if (isSpecial && caster.sci.specialEffect === 'reflect_heal') {
          audio.playHeal();
          const heal = Math.round(caster.maxHp * 0.22);
          caster.hp = Math.min(caster.maxHp, caster.hp + heal);
          caster.statuses.reflectTurns = 2;
          spawnVfx('shield', caster, caster, '#10b981');
          spawnFloating(caster, `+${heal} HP`, 'heal', 'F=-kx 反彈護盾');
          current[casterIdx] = caster;
        } else {
          let anyCrit = false;
          let reflectTotal = 0;

          let vfxKind: VfxEvent['kind'] = 'spell';
          if (isSuper) vfxKind = 'super';
          else if (action.kind === 'attack') vfxKind = 'strike';
          else if (caster.sci.id === 'newton') vfxKind = 'apple';
          else if (['maxwell', 'faraday', 'coulomb', 'ampere', 'ohm', 'thomson'].includes(caster.sci.id))
            vfxKind = 'lightning';
          else if (caster.sci.id === 'kelvin') vfxKind = 'ice';

          targets.forEach((t) => {
            const idx = current.findIndex((c) => c.uid === t.uid);
            if (idx === -1) return;
            const target = { ...current[idx], statuses: { ...current[idx].statuses } };

            const dodgeChance =
              (target.statuses.evasionTurns > 0 ? 0.45 : 0) +
              (caster.statuses.blindTurns > 0 ? 0.3 : 0);
            if (!isSuper && Math.random() < dodgeChance) {
              spawnVfx(vfxKind, caster, target, caster.sci.accentColor);
              spawnFloating(target, 'MISS', 'miss', '閃避成功');
              return;
            }

            const baseStat =
              action.kind === 'attack'
                ? caster.sci.power * 2.55 + caster.sci.specialStat * 0.4
                : caster.sci.specialStat * 3.1 + caster.sci.power * 1.4;

            let mult = 1.0;
            if (isSpecial) {
              if (action.targetType === 'all_enemies') mult = 1.18;
              else if (caster.sci.specialEffect === 'multi_hit') mult = 1.48;
              else if (caster.sci.specialEffect === 'cat_gamble') {
                mult = Math.random() < 0.5 ? 1.85 : 1.15;
              } else mult = 1.42;
            } else if (isSuper) {
              mult = action.targetType === 'all_enemies' ? 2.15 : 2.75;
            }

            const elemMult =
              action.kind === 'attack' ? 1.0 : getElementMultiplier(caster.sci.element, target.sci.element);
            const enemyAttackScale =
              caster.side === 'enemy'
                ? difficulty === 'easy'
                  ? 0.78
                  : difficulty === 'hard'
                  ? 1.15
                  : 0.94
                : 1.0;

            const isCrit = isSuper || Math.random() < (caster.sci.speed >= 90 ? 0.24 : 0.14);
            if (isCrit) anyCrit = true;

            const pierce =
              (isSpecial && caster.sci.specialEffect === 'pierce_def') ||
              (isSuper && caster.sci.superEffect === 'pierce_aoe');

            let defMult = 1.0;
            let guardBlocked = false;
            if (!pierce) {
              if (target.guarding) {
                defMult *= 0.45;
                guardBlocked = true;
              }
              if (target.statuses.shieldTurns > 0) defMult *= 0.62;
              if (target.statuses.reflectTurns > 0) defMult *= 0.65;
            }
            if (target.statuses.defBreakTurns > 0) defMult *= 1.35;

            const variance = 0.93 + Math.random() * 0.14;
            const dmg = Math.max(
              40,
              Math.round(baseStat * mult * elemMult * enemyAttackScale * (isCrit ? 1.32 : 1) * defMult * variance)
            );

            target.hp = Math.max(0, target.hp - dmg);
            target.pose = target.hp === 0 ? 'ko' : target.guarding ? 'guard' : 'hurt';
            target.limit = Math.min(100, target.limit + 18);

            actionDamageTotal += dmg;
            highestHit = Math.max(highestHit, dmg);

            if (!pierce && target.statuses.reflectTurns > 0 && target.hp > 0) {
              reflectTotal += Math.round(dmg * 0.28);
            }

            let statusNote = guardBlocked ? '防禦減傷!' : elemMult > 1 ? '弱點突破!' : '';
            if (isSpecial && target.hp > 0) {
              switch (caster.sci.specialEffect) {
                case 'heavy_stun':
                  target.ctbGauge = Math.max(0, target.ctbGauge - 340);
                  statusNote = '重力延遲!';
                  break;
                case 'slow':
                  target.statuses.slowTurns = 2;
                  target.ctbGauge = Math.max(0, target.ctbGauge - 220);
                  statusNote = '減速 SLOW';
                  break;
                case 'poison':
                  target.statuses.poisonTurns = 3;
                  statusNote = '輻射衰變';
                  break;
                case 'def_break':
                  target.statuses.defBreakTurns = 2;
                  statusNote = '破防 DEF↓';
                  break;
                case 'haste_strike':
                  caster.ctbGauge = Math.min(750, caster.ctbGauge + 380);
                  statusNote = '量子躍遷!';
                  break;
                case 'evasion_strike':
                  caster.statuses.evasionTurns = 2;
                  statusNote = '測不準迴避';
                  break;
                case 'limit_boost':
                  caster.limit = Math.min(100, caster.limit + 20);
                  statusNote = '極限 +20%';
                  break;
                case 'lifesteal': {
                  const heal = Math.round(caster.maxHp * 0.18);
                  caster.hp = Math.min(caster.maxHp, caster.hp + heal);
                  spawnFloating(caster, `+${heal} HP`, 'heal', '熱能吸收');
                  break;
                }
                case 'cat_gamble':
                  if (mult > 1.5) {
                    statusNote = '超級雷射貓!';
                  } else {
                    target.statuses.poisonTurns = 2;
                    statusNote = '毒氣疊加!';
                  }
                  break;
                default:
                  break;
              }
            } else if (isSuper && target.hp > 0) {
              if (caster.sci.superEffect === 'aoe_break_def') target.statuses.defBreakTurns = 2;
              if (caster.sci.superEffect === 'aoe_slow_freeze') {
                target.statuses.slowTurns = 2;
                target.ctbGauge = Math.max(0, target.ctbGauge - 350);
              }
              if (caster.sci.superEffect === 'aoe_poison') target.statuses.poisonTurns = 3;
              if (caster.sci.superEffect === 'single_nuke_stun') target.ctbGauge = 0;
            }

            spawnVfx(
              vfxKind,
              caster,
              target,
              caster.sci.accentColor,
              isSuper ? caster.sci.formula : undefined,
              isSuper ? 850 : 600
            );
            spawnFloating(target, `-${dmg}`, isCrit ? 'crit' : 'damage', statusNote || undefined);

            current[idx] = target;
          });

          if (isSuper) {
            if (caster.sci.superEffect === 'party_shield_nuke') {
              current.forEach((c, i) => {
                if (c.side === caster.side && c.hp > 0) {
                  current[i] = { ...c, statuses: { ...c.statuses, shieldTurns: 2 } };
                  spawnFloating(c, '法拉第護盾', 'status');
                }
              });
            } else if (caster.sci.superEffect === 'haste_all_nuke') {
              current.forEach((c, i) => {
                if (c.side === caster.side && c.hp > 0) {
                  current[i] = {
                    ...c,
                    ctbGauge: Math.min(900, c.ctbGauge + 320),
                    statuses: { ...c.statuses, hasteTurns: 2 },
                  };
                  spawnFloating(c, '全體加速!', 'status');
                }
              });
            }
          }

          if (reflectTotal > 0) {
            caster.hp = Math.max(1, caster.hp - reflectTotal);
            spawnFloating(caster, `-${reflectTotal}`, 'status', '彈性反彈!');
            current[casterIdx] = caster;
          }

          if (isSuper) {
            audio.playLimitBreak();
            triggerShake();
          } else if (anyCrit) {
            audio.playCrit();
            triggerShake();
          } else if (action.kind === 'attack') {
            audio.playHit();
          } else {
            audio.playSpell();
          }
        }

        if (caster.side === 'player') {
          setStats((prev) => ({
            turns: prev.turns + 1,
            maxHit: Math.max(prev.maxHit, highestHit),
            totalDamage: prev.totalDamage + actionDamageTotal,
          }));
        }

        setCombatants(current);

        scheduleTimeout(() => {
          const settled = combatantsRef.current.map((c) => ({
            ...c,
            pose:
              c.hp <= 0
                ? ('ko' as SpritePose)
                : c.guarding
                ? ('guard' as SpritePose)
                : ('idle' as SpritePose),
          }));
          setCombatants(settled);
          advanceToNextTurn(settled, caster.side, roundNum);
        }, isSuper ? 920 : 650);
      };

      if (isSuper) {
        audio.playLimitBreak();
        setCutIn({ sci: actor.sci, superName: action.label });
        scheduleTimeout(() => {
          setCutIn(null);
          runResolution();
        }, 1050);
      } else {
        runResolution();
      }
    },
    [advanceToNextTurn, difficulty, roundNum, scheduleTimeout, spawnFloating, spawnVfx, triggerShake]
  );

  // CPU AI Turn
  const triggerCpuTurn = useCallback(
    (enemy: Combatant, roster: Combatant[]) => {
      if (outcomeRef.current) return;
      const alivePlayers = roster.filter((c) => c.side === 'player' && c.hp > 0);
      if (alivePlayers.length === 0) return;

      const sortedPlayers = [...alivePlayers].sort((a, b) => a.hp - b.hp);
      const targetPlayer =
        difficulty === 'hard' || Math.random() < 0.45
          ? sortedPlayers[0]
          : alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

      if (enemy.limit >= 100) {
        executeCombatAction(
          enemy.uid,
          {
            kind: 'super',
            label: enemy.sci.superName,
            targetType:
              enemy.sci.superEffect === 'single_nuke_stun' ? 'enemy' : 'all_enemies',
          },
          targetPlayer.uid
        );
        return;
      }

      const branch = BRANCH_SPELLS[enemy.sci.element];
      const useSpecialProb = difficulty === 'hard' ? 0.65 : difficulty === 'normal' ? 0.5 : 0.35;

      const injuredAlly = roster
        .filter((c) => c.side === 'enemy' && c.hp > 0 && c.hp < c.maxHp * 0.45)
        .sort((a, b) => a.hp - b.hp)[0];
      if (
        injuredAlly &&
        (branch.kind === 'heal' || branch.kind === 'regen') &&
        enemy.mp >= branch.mpCost &&
        Math.random() < 0.65
      ) {
        executeCombatAction(
          enemy.uid,
          { kind: 'branch', label: branch.name, targetType: branch.target },
          injuredAlly.uid
        );
        return;
      }

      if (enemy.mp >= enemy.sci.specialMp && Math.random() < useSpecialProb) {
        executeCombatAction(
          enemy.uid,
          {
            kind: 'special',
            label: enemy.sci.specialName,
            targetType: enemy.sci.specialTarget,
          },
          targetPlayer.uid
        );
        return;
      }

      executeCombatAction(
        enemy.uid,
        { kind: 'attack', label: '物理攻擊', targetType: 'enemy' },
        targetPlayer.uid
      );
    },
    [difficulty, executeCombatAction]
  );

  triggerCpuTurnRef.current = triggerCpuTurn;

  // Guard Command (Player defensive stance for the upcoming enemy phase)
  const executeGuard = useCallback(
    (actorUid: string) => {
      if (isBusyRef.current || outcomeRef.current) return;
      isBusyRef.current = true;
      audio.playConfirm();
      setMenuView('root');
      setPendingAction(null);

      const updated = combatantsRef.current.map((c) => {
        if (c.uid !== actorUid) return c;
        const nextMp = Math.min(c.maxMp, c.mp + 12);
        const nextLimit = Math.min(100, c.limit + 25);
        spawnFloating(c, '防禦姿態', 'status', '+12 MP · +25% 極限');
        setBannerText(`${c.sci.name} 進入鐵壁防禦！（減傷 55%）`);
        return {
          ...c,
          actedThisPhase: true,
          ctbGauge: 0,
          mp: nextMp,
          limit: nextLimit,
          guarding: true,
          pose: 'guard' as SpritePose,
        };
      });

      setCombatants(updated);
      setStats((prev) => ({ ...prev, turns: prev.turns + 1 }));

      scheduleTimeout(() => {
        advanceToNextTurn(updated, 'player', roundNum);
      }, 420);
    },
    [advanceToNextTurn, roundNum, scheduleTimeout, spawnFloating]
  );

  const activeHero = useMemo(
    () =>
      phase === 'player' && !isBusyRef.current
        ? combatants.find((c) => c.uid === activeActorUid && c.side === 'player' && c.hp > 0) || null
        : combatants.find((c) => c.uid === activeActorUid && c.side === 'player' && c.hp > 0) || null,
    [combatants, activeActorUid, phase]
  );

  const playerParty = useMemo(() => combatants.filter((c) => c.side === 'player'), [combatants]);
  const enemyParty = useMemo(() => combatants.filter((c) => c.side === 'enemy'), [combatants]);

  const unactedHeroes = useMemo(
    () =>
      turnMode === 'phase'
        ? playerParty.filter((p) => p.hp > 0 && !p.actedThisPhase)
        : [],
    [playerParty, turnMode]
  );

  const upcomingOrder = useMemo(
    () => (turnMode === 'speed' ? previewUpcomingOrder(combatants, activeActorUid, 6) : []),
    [combatants, activeActorUid, turnMode]
  );

  const handleSelectHeroInPhase = (uid: string) => {
    if (turnMode !== 'phase' || phase !== 'player' || isBusyRef.current || outcome) return;
    const target = playerParty.find((p) => p.uid === uid && p.hp > 0 && !p.actedThisPhase);
    if (!target) return;
    audio.playCursor();
    setCombatants((prev) =>
      prev.map((c) =>
        c.side === 'player' && c.hp > 0 && !c.actedThisPhase
          ? { ...c, pose: c.uid === uid ? ('ready' as SpritePose) : ('idle' as SpritePose) }
          : c
      )
    );
    setActiveActorUid(uid);
    setMenuView('root');
    setPendingAction(null);
    setBannerText(`切換由「${target.sci.name}」優先行動！`);
  };

  const handleChooseCommand = (action: PendingAction) => {
    if (!activeHero || isBusyRef.current || phase !== 'player') return;
    audio.playConfirm();

    if (
      action.targetType === 'all_enemies' ||
      action.targetType === 'all_allies' ||
      action.targetType === 'self'
    ) {
      executeCombatAction(activeHero.uid, action);
      return;
    }

    const aliveEnemies = enemyParty.filter((e) => e.hp > 0);
    if (action.targetType === 'enemy' && aliveEnemies.length === 1) {
      executeCombatAction(activeHero.uid, action, aliveEnemies[0].uid);
      return;
    }

    setPendingAction(action);
    setMenuView('target');
  };

  const handleArenaClickTarget = (target: Combatant) => {
    if (isBusyRef.current || phase !== 'player') return;

    // Allow clicking an unacted ally in root menu during 'phase' mode to switch acting hero
    if (
      turnMode === 'phase' &&
      menuView === 'root' &&
      target.side === 'player' &&
      target.hp > 0 &&
      !target.actedThisPhase
    ) {
      handleSelectHeroInPhase(target.uid);
      return;
    }

    if (!activeHero || !pendingAction || menuView !== 'target') return;

    const valid =
      (pendingAction.targetType === 'enemy' && target.side === 'enemy' && target.hp > 0) ||
      (pendingAction.targetType === 'ally' && target.side === 'player' && target.hp > 0) ||
      (pendingAction.targetType === 'ko_ally' && target.side === 'player' && target.hp <= 0);

    if (!valid) return;
    audio.playConfirm();
    executeCombatAction(activeHero.uid, pendingAction, target.uid);
  };

  const handleRematch = () => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
    isBusyRef.current = false;
    audio.playConfirm();
    const fresh = initMatchState();
    setCombatants(fresh.roster);
    setActiveActorUid(fresh.activeUid);
    setPhase(fresh.phase);
    setRoundNum(1);
    setItemCounts({
      apple_potion: 4,
      quantum_ether: 3,
      planck_revive: 2,
      calibration_kit: 2,
    });
    setMenuView('root');
    setPendingAction(null);
    setOutcome(null);
    setCutIn(null);
    setVfxEvents([]);
    setFloatingNums([]);
    setStats({ turns: 0, maxHit: 0, totalDamage: 0 });
    setBannerText(
      turnMode === 'phase'
        ? '第 1 回合・我方進攻階段！請選擇攻防指令'
        : '第 1 回合開始！依科學家速度順序展開回合攻防'
    );
  };

  const mvpScientist = useMemo(() => {
    const alive = playerParty.find((c) => c.hp > 0);
    return (alive || playerParty[0]).sci;
  }, [playerParty]);

  const showCommandControls = phase === 'player' && activeHero !== null && !outcome;

  return (
    <div className="min-h-screen bg-[#050811] text-slate-100 flex flex-col select-none">
      {/* Slim Top Battle Header */}
      <header className="border-b border-slate-800/80 bg-[#080d1c]/95 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <button
            type="button"
            onClick={() => {
              audio.playCancel();
              onReturnToSelect();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>編隊</span>
          </button>
          <span className="font-display text-sm sm:text-base font-bold text-amber-300">
            {stage.name}
          </span>
          <span className="hidden md:inline text-xs text-slate-400">
            {format === '3v3' ? '3v3 小隊戰' : '1v1 決鬥'} · {turnMode === 'phase' ? '陣營輪流回合制' : '速度序列回合制'}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="font-mono-num text-xs font-bold text-slate-200 whitespace-nowrap">
            第 {roundNum} 回合 ·{' '}
            <span className={phase === 'player' ? 'text-amber-300' : 'text-rose-400'}>
              {phase === 'player' ? '我方回合' : '敵方攻勢'}
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? '開啟音效' : '靜音'}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Battle Stage + Bottom FF Command Deck */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 py-3 flex flex-col gap-3">
        {/* BATTLE STAGE VIEWPORT */}
        <div
          className={`relative w-full aspect-[16/9] max-h-[540px] rounded-xl overflow-hidden border-2 border-slate-700/80 bg-slate-950 shadow-2xl transition-transform duration-75 ${
            stageShake ? 'translate-x-1 -translate-y-1' : ''
          }`}
        >
          <img
            src={stage.imageUrl}
            alt={stage.name}
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/45" />

          {/* Top FF Turn Announcement Banner */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-2xl">
            <div className="ff-window rounded-lg px-4 py-2 text-center">
              <p className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                {bannerText}
              </p>
            </div>
          </div>

          {/* Enemy Compact Status Strip (Top-Left) */}
          <div className="absolute top-16 left-3 sm:left-4 z-30 flex flex-col gap-1.5 w-48 sm:w-56">
            {enemyParty.map((e) => {
              const hpPct = Math.max(0, Math.round((e.hp / e.maxHp) * 100));
              const isEnemyActing = activeActorUid === e.uid && phase === 'enemy';
              return (
                <div
                  key={e.uid}
                  className={`rounded-lg px-2.5 py-1.5 bg-slate-950/85 border backdrop-blur-sm transition-colors ${
                    e.hp <= 0
                      ? 'border-slate-800 opacity-50'
                      : isEnemyActing
                      ? 'border-amber-400 ring-1 ring-amber-400/50'
                      : 'border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-rose-200 truncate">
                      {isEnemyActing ? '▶ ' : ''}
                      {e.sci.name}
                    </span>
                    <span className="font-mono-num text-slate-300">
                      {e.hp}/{e.maxHp}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 transition-all duration-300"
                      style={{ width: `${hpPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Top-Right Turn Order / Phase Summary Strip */}
          {turnMode === 'speed' && upcomingOrder.length > 0 && (
            <div className="hidden sm:flex absolute top-16 right-4 z-30 flex-col gap-1 bg-slate-950/85 border border-slate-700/80 rounded-lg px-3 py-2 backdrop-blur-sm w-44">
              <div className="text-[10px] font-bold text-slate-400 border-b border-slate-800 pb-1">
                行動順序預覽
              </div>
              {upcomingOrder.map((u, idx) => (
                <div
                  key={`${u.uid}-${idx}`}
                  className="flex items-center justify-between text-[11px] font-medium"
                >
                  <span
                    className={`truncate ${
                      idx === 0
                        ? 'text-amber-300 font-bold'
                        : u.side === 'player'
                        ? 'text-sky-200'
                        : 'text-rose-300'
                    }`}
                  >
                    {idx + 1}. {u.sci.name}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                    {u.side === 'player' ? '我' : '敵'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Combatant Sprites on Stage Floor */}
          <div className="absolute inset-0 z-10">
            {combatants.map((c) => {
              const pt = getSlotCoords(c.side, c.slotIndex, format);
              const isCurrentActor = c.uid === activeActorUid;
              const stepForward = isCurrentActor ? (c.side === 'player' ? -2.8 : 2.8) : 0;

              const isValidTarget =
                menuView === 'target' &&
                pendingAction &&
                ((pendingAction.targetType === 'enemy' && c.side === 'enemy' && c.hp > 0) ||
                  (pendingAction.targetType === 'ally' && c.side === 'player' && c.hp > 0) ||
                  (pendingAction.targetType === 'ko_ally' && c.side === 'player' && c.hp <= 0));

              const canSwitchToHero =
                turnMode === 'phase' &&
                phase === 'player' &&
                menuView === 'root' &&
                c.side === 'player' &&
                c.hp > 0 &&
                !c.actedThisPhase;

              return (
                <div
                  key={c.uid}
                  onClick={() => handleArenaClickTarget(c)}
                  style={{
                    left: `${(pt.x / 1000) * 100 + stepForward}%`,
                    top: `${(pt.y / 560) * 100}%`,
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ${
                    isValidTarget
                      ? 'cursor-pointer ring-2 ring-amber-400 rounded-full bg-amber-400/10'
                      : canSwitchToHero
                      ? 'cursor-pointer'
                      : ''
                  }`}
                >
                  {(isCurrentActor || isValidTarget) && (
                    <div
                      className={`absolute -top-5 left-1/2 -translate-x-1/2 font-bold text-xs whitespace-nowrap drop-shadow ff-cursor ${
                        c.side === 'enemy' && !isValidTarget ? 'text-rose-400' : 'text-amber-300'
                      }`}
                    >
                      {isValidTarget ? '▼ 選擇目標' : c.side === 'player' ? '▼ 行動中' : '▼ 敵方攻擊'}
                    </div>
                  )}

                  <ScientistSprite
                    scientist={c.sci}
                    pose={c.pose}
                    facing={c.side === 'player' ? 'left' : 'right'}
                    size={format === '1v1' ? 148 : 122}
                    hasShield={c.statuses.shieldTurns > 0 || c.guarding}
                    hasHaste={c.statuses.hasteTurns > 0}
                    hasSlow={c.statuses.slowTurns > 0}
                    hasPoison={c.statuses.poisonTurns > 0}
                    hasEvasion={c.statuses.evasionTurns > 0}
                    hasReflect={c.statuses.reflectTurns > 0}
                    limitFull={c.limit >= 100}
                  />

                  <div className="text-center -mt-2">
                    <span className="px-2 py-0.5 rounded bg-black/70 text-[11px] font-bold text-slate-200 whitespace-nowrap">
                      {c.sci.name}
                      {c.guarding ? ' · 防禦' : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <BattleVfxCanvas events={vfxEvents} />

          {/* Floating Bouncing JRPG Damage / Defense Numbers */}
          <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
            {floatingNums.map((fn) => (
              <div
                key={fn.id}
                style={{ left: `${fn.xPct}%`, top: `${fn.yPct}%` }}
                className="absolute ff-damage-num text-center whitespace-nowrap"
              >
                <div
                  className={`font-mono-num text-xl sm:text-2xl font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] ${
                    fn.tone === 'crit'
                      ? 'text-amber-300 text-2xl sm:text-3xl'
                      : fn.tone === 'heal'
                      ? 'text-emerald-300'
                      : fn.tone === 'mp'
                      ? 'text-sky-300'
                      : fn.tone === 'status'
                      ? 'text-cyan-200 text-sm sm:text-base'
                      : fn.tone === 'miss'
                      ? 'text-slate-300 text-base sm:text-lg'
                      : 'text-white'
                  }`}
                >
                  {fn.text}
                </div>
                {fn.subText && (
                  <div className="text-[11px] font-bold text-amber-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                    {fn.subText}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Limit Break Cut-In Banner */}
          {cutIn && (
            <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-[2px] flex items-center justify-center">
              <div className="w-full bg-gradient-to-r from-slate-950 via-[#172554] to-slate-950 border-y-2 border-amber-400 py-5 px-6 flex items-center justify-center gap-6 shadow-2xl">
                <div className="w-24 h-24 rounded-xl border-2 border-amber-300 overflow-hidden bg-slate-950 shrink-0">
                  <ScientistSprite scientist={cutIn.sci} portraitOnly size={96} />
                </div>
                <div className="max-w-xl">
                  <div className="text-xs font-bold tracking-widest text-amber-400">
                    極限公式奧義 · LIMIT BREAK
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-white mt-0.5">
                    {cutIn.sci.name}：《{cutIn.superName}》
                  </div>
                  <div className="font-mono-num text-base sm:text-lg font-bold text-cyan-300 mt-1">
                    {cutIn.sci.formula}
                  </div>
                  <p className="text-xs sm:text-sm text-amber-200/90 mt-1.5">
                    {cutIn.sci.quote}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM CLASSIC FINAL FANTASY COMMAND DECK */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
          {/* LEFT 5 COLS: FF Command Window */}
          <div className="lg:col-span-5 ff-window rounded-xl p-3.5 flex flex-col justify-between min-h-[196px]">
            {showCommandControls && activeHero ? (
              <>
                <div className="flex items-center justify-between border-b border-blue-300/20 pb-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-amber-300">
                      {activeHero.sci.name}
                    </span>
                    <span className="text-xs text-blue-200/80">
                      {activeHero.sci.roleTitle} · MP {activeHero.mp}/{activeHero.maxMp}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {turnMode === 'phase' && unactedHeroes.length > 1 && menuView === 'root' && (
                      <button
                        type="button"
                        onClick={() => {
                          const idx = unactedHeroes.findIndex((h) => h.uid === activeHero.uid);
                          const next = unactedHeroes[(idx + 1) % unactedHeroes.length];
                          handleSelectHeroInPhase(next.uid);
                        }}
                        className="px-2 py-0.5 text-[11px] font-semibold rounded bg-blue-950/90 hover:bg-blue-900 border border-blue-400/50 text-blue-100 cursor-pointer whitespace-nowrap"
                      >
                        切換順序 ({unactedHeroes.length})
                      </button>
                    )}
                    {menuView !== 'root' && (
                      <button
                        type="button"
                        onClick={() => {
                          audio.playCancel();
                          setMenuView('root');
                          setPendingAction(null);
                        }}
                        className="px-2 py-0.5 text-[11px] font-semibold rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-400/50 text-slate-200 cursor-pointer whitespace-nowrap"
                      >
                        返回
                      </button>
                    )}
                  </div>
                </div>

                {/* ROOT COMMANDS */}
                {menuView === 'root' && (
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    {activeHero.limit >= 100 && (
                      <button
                        type="button"
                        onClick={() =>
                          handleChooseCommand({
                            kind: 'super',
                            label: activeHero.sci.superName,
                            targetType:
                              activeHero.sci.superEffect === 'single_nuke_stun'
                                ? 'enemy'
                                : 'all_enemies',
                          })
                        }
                        className="col-span-2 flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-black text-sm shadow-lg cursor-pointer transition-transform active:scale-[0.99]"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Sparkles className="w-4 h-4 shrink-0" />
                          <span className="truncate">極限奧義：{activeHero.sci.superName}</span>
                        </span>
                        <span className="font-mono-num text-xs shrink-0 ml-2">LIMIT 100%</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        handleChooseCommand({
                          kind: 'attack',
                          label: '物理攻擊',
                          targetType: 'enemy',
                        })
                      }
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-blue-950/70 hover:bg-blue-800/80 border border-blue-400/40 text-left text-sm font-bold text-white cursor-pointer transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Swords className="w-4 h-4 text-amber-300" />
                        <span>物理攻擊</span>
                      </span>
                      <span className="text-[11px] font-mono-num text-emerald-300">+6 MP</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        audio.playCursor();
                        setMenuView('skills');
                      }}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-blue-950/70 hover:bg-blue-800/80 border border-blue-400/40 text-left text-sm font-bold text-white cursor-pointer transition-colors"
                    >
                      <span>物理奧義</span>
                      <span className="text-[11px] text-sky-300">2 招式</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        audio.playCursor();
                        setMenuView('items');
                      }}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-blue-950/70 hover:bg-blue-800/80 border border-blue-400/40 text-left text-sm font-bold text-white cursor-pointer transition-colors"
                    >
                      <span>公式道具</span>
                      <span className="text-[11px] text-amber-200">補給品</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => executeGuard(activeHero.uid)}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-blue-950/70 hover:bg-blue-800/80 border border-blue-400/40 text-left text-sm font-bold text-white cursor-pointer transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-sky-300" />
                        <span>防禦</span>
                      </span>
                      <span className="text-[11px] text-blue-200">減傷55%</span>
                    </button>
                  </div>
                )}

                {/* SKILLS SUBMENU */}
                {menuView === 'skills' && (
                  <div className="flex flex-col gap-2 flex-1 justify-center">
                    {(() => {
                      const canSpecial = activeHero.mp >= activeHero.sci.specialMp;
                      const branch = BRANCH_SPELLS[activeHero.sci.element];
                      const canBranch = activeHero.mp >= branch.mpCost;
                      return (
                        <>
                          <button
                            type="button"
                            disabled={!canSpecial}
                            onClick={() =>
                              handleChooseCommand({
                                kind: 'special',
                                label: activeHero.sci.specialName,
                                targetType: activeHero.sci.specialTarget,
                              })
                            }
                            className={`p-2.5 rounded-lg border text-left transition-colors ${
                              canSpecial
                                ? 'bg-blue-950/80 hover:bg-blue-800/80 border-blue-400/50 cursor-pointer'
                                : 'bg-slate-900/50 border-slate-700/50 opacity-45 cursor-not-allowed'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span className="text-amber-300">{activeHero.sci.specialName}</span>
                              <span className="font-mono-num text-sky-300">{activeHero.sci.specialMp} MP</span>
                            </div>
                            <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-2">
                              {activeHero.sci.specialDesc}
                            </p>
                          </button>

                          <button
                            type="button"
                            disabled={!canBranch}
                            onClick={() =>
                              handleChooseCommand({
                                kind: 'branch',
                                label: branch.name,
                                targetType: branch.target,
                              })
                            }
                            className={`p-2.5 rounded-lg border text-left transition-colors ${
                              canBranch
                                ? 'bg-blue-950/80 hover:bg-blue-800/80 border-blue-400/50 cursor-pointer'
                                : 'bg-slate-900/50 border-slate-700/50 opacity-45 cursor-not-allowed'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span className="text-emerald-300">{branch.name}</span>
                              <span className="font-mono-num text-sky-300">{branch.mpCost} MP</span>
                            </div>
                            <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-2">
                              {branch.desc}
                            </p>
                          </button>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* ITEMS SUBMENU */}
                {menuView === 'items' && (
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    {BATTLE_ITEMS.map((item) => {
                      const qty = itemCounts[item.id];
                      const hasKoTarget = playerParty.some((p) => p.hp <= 0);
                      const usable = qty > 0 && (item.target !== 'ko_ally' || hasKoTarget);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={!usable}
                          onClick={() =>
                            handleChooseCommand({
                              kind: 'item',
                              label: item.name,
                              targetType: item.target,
                              itemId: item.id,
                            })
                          }
                          className={`p-2 rounded-lg border text-left transition-colors ${
                            usable
                              ? 'bg-blue-950/80 hover:bg-blue-800/80 border-blue-400/50 cursor-pointer'
                              : 'bg-slate-900/50 border-slate-700/50 opacity-45 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-slate-100 truncate">{item.name}</span>
                            <span className="font-mono-num text-amber-300 ml-1">x{qty}</span>
                          </div>
                          <div className="text-[10px] text-slate-300 mt-0.5 truncate">
                            {item.shortDesc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* TARGET SELECT SUBMENU */}
                {menuView === 'target' && pendingAction && (
                  <div className="flex flex-col gap-2 flex-1 justify-center">
                    <div className="text-xs text-amber-200 font-medium">
                      請選擇《{pendingAction.label}》的目標（或直接點擊舞台上的角色）：
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(pendingAction.targetType === 'enemy' ? enemyParty : playerParty).map((t) => {
                        const selectable =
                          pendingAction.targetType === 'ko_ally' ? t.hp <= 0 : t.hp > 0;
                        return (
                          <button
                            key={t.uid}
                            type="button"
                            disabled={!selectable}
                            onClick={() => handleArenaClickTarget(t)}
                            className={`p-2 rounded-lg border text-left transition-colors ${
                              selectable
                                ? 'bg-blue-950/85 hover:bg-amber-500/20 border-amber-400/70 cursor-pointer'
                                : 'bg-slate-900/40 border-slate-800 opacity-40 cursor-not-allowed'
                            }`}
                          >
                            <div className="text-xs font-bold text-slate-100 truncate">{t.sci.name}</div>
                            <div className="text-[10px] font-mono-num text-slate-300 mt-0.5">
                              HP {t.hp}/{t.maxHp}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                <div className="text-sm font-bold text-rose-200">
                  {outcome
                    ? '戰鬥已結束'
                    : phase === 'enemy'
                    ? '敵方攻勢回合進行中…'
                    : '招式演出中…'}
                </div>
                <p className="text-xs text-blue-200/75 mt-1">
                  {phase === 'enemy'
                    ? '防禦中或持有法拉第護盾的賢者將自動減免傷害'
                    : '回合結算完成後立即輪到下一位賢者行動'}
                </p>
              </div>
            )}
          </div>

          {/* RIGHT 7 COLS: FF Party Status Table */}
          <div className="lg:col-span-7 ff-window rounded-xl p-3.5 flex flex-col justify-center">
            <div className="grid grid-cols-12 text-[11px] font-semibold text-blue-200/80 border-b border-blue-300/20 pb-1.5 mb-2 px-1">
              <div className="col-span-4">我方科學家</div>
              <div className="col-span-3 text-right">HP</div>
              <div className="col-span-2 text-right">MP</div>
              <div className="col-span-3 text-right">回合狀態 · 極限</div>
            </div>

            <div className="space-y-2.5">
              {playerParty.map((p) => {
                const isActive = p.uid === activeActorUid && phase === 'player';
                const hpPct = Math.max(0, Math.round((p.hp / p.maxHp) * 100));
                const mpPct = Math.max(0, Math.round((p.mp / p.maxMp) * 100));
                const statusLabels: string[] = [];
                if (p.guarding) statusLabels.push('防禦中');
                if (p.statuses.shieldTurns > 0) statusLabels.push('護盾');
                if (p.statuses.reflectTurns > 0) statusLabels.push('反彈');
                if (p.statuses.hasteTurns > 0) statusLabels.push('加速');
                if (p.statuses.evasionTurns > 0) statusLabels.push('迴避');
                if (p.statuses.slowTurns > 0) statusLabels.push('減速');
                if (p.statuses.poisonTurns > 0) statusLabels.push('輻射');

                const turnLabel =
                  p.hp <= 0
                    ? 'KO'
                    : isActive
                    ? '行動中'
                    : turnMode === 'phase'
                    ? p.actedThisPhase
                      ? p.guarding
                        ? '防禦'
                        : '已行動'
                      : '待命'
                    : `${Math.floor((p.ctbGauge / 1000) * 100)}%`;

                return (
                  <div
                    key={p.uid}
                    onClick={() => handleSelectHeroInPhase(p.uid)}
                    className={`grid grid-cols-12 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                      p.hp <= 0
                        ? 'opacity-45 bg-slate-950/40'
                        : isActive
                        ? 'bg-amber-500/15 ring-1 ring-amber-400/70'
                        : turnMode === 'phase' && phase === 'player' && !p.actedThisPhase
                        ? 'bg-blue-950/50 hover:bg-blue-900/60 cursor-pointer'
                        : 'bg-blue-950/35'
                    }`}
                  >
                    <div className="col-span-4 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isActive && <span className="text-amber-300 text-xs ff-cursor">▶</span>}
                        <span className={`font-bold text-sm truncate ${p.hp <= 0 ? 'text-rose-400' : 'text-white'}`}>
                          {p.sci.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-cyan-300 truncate">
                        {p.hp <= 0
                          ? '無法戰鬥'
                          : statusLabels.length > 0
                          ? statusLabels.join(' · ')
                          : p.sci.formula}
                      </div>
                    </div>

                    <div className="col-span-3 text-right">
                      <div
                        className={`font-mono-num text-xs font-bold ${
                          hpPct <= 25 ? 'text-rose-400' : hpPct <= 50 ? 'text-amber-300' : 'text-emerald-300'
                        }`}
                      >
                        {p.hp}/{p.maxHp}
                      </div>
                      <div className="mt-1 h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            hpPct <= 25 ? 'bg-rose-500' : hpPct <= 50 ? 'bg-amber-400' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${hpPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="col-span-2 text-right">
                      <div className="font-mono-num text-xs font-bold text-sky-300">
                        {p.mp}
                      </div>
                      <div className="mt-1 h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-400 transition-all duration-300"
                          style={{ width: `${mpPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="col-span-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 text-[10px] font-mono-num">
                        <span
                          className={
                            isActive
                              ? 'text-amber-300 font-bold'
                              : turnLabel === '待命'
                              ? 'text-emerald-300 font-semibold'
                              : 'text-slate-300'
                          }
                        >
                          {turnLabel}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className={p.limit >= 100 ? 'text-rose-300 font-bold' : 'text-purple-300'}>
                          極 {Math.floor(p.limit)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-200 ${
                            p.limit >= 100 ? 'bg-rose-400' : 'bg-purple-400'
                          }`}
                          style={{ width: `${Math.min(100, p.limit)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* VICTORY / DEFEAT MODAL */}
      {outcome && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="ff-window rounded-2xl max-w-lg w-full p-6">
            <div className="text-center border-b border-blue-300/20 pb-4 mb-4">
              <div className="text-xs font-bold tracking-widest text-amber-300">
                {outcome === 'victory' ? 'VICTORY FANFARE' : 'DEFEAT'}
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white mt-1">
                {outcome === 'victory' ? '物理對戰勝利！' : '理論實驗失敗…'}
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center bg-slate-950/60 rounded-xl p-3 border border-blue-300/20 mb-4">
              <div>
                <div className="text-[11px] text-slate-400">經歷回合</div>
                <div className="font-mono-num text-lg font-bold text-slate-100">{roundNum}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">單次最高傷害</div>
                <div className="font-mono-num text-lg font-bold text-amber-300">{stats.maxHit}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">累計總輸出</div>
                <div className="font-mono-num text-lg font-bold text-emerald-300">{stats.totalDamage}</div>
              </div>
            </div>

            <div className="bg-slate-950/70 rounded-xl p-4 border border-slate-700/70 mb-5">
              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-amber-400/60 shrink-0">
                  <ScientistSprite scientist={mvpScientist} portraitOnly size={48} />
                </div>
                <div>
                  <div className="text-xs font-bold text-amber-300">
                    代表賢者：{mvpScientist.name} ({mvpScientist.formula})
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">{mvpScientist.quote}</div>
                </div>
              </div>
              <div className="text-xs text-slate-300 leading-relaxed border-t border-slate-800 pt-2.5">
                <span className="text-amber-300 font-bold">Physgram 冷知識：</span>
                {mvpScientist.trivia}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  audio.playCursor();
                  onReturnToSelect();
                }}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-600 text-xs sm:text-sm font-semibold text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
              >
                更換陣容
              </button>
              <button
                type="button"
                onClick={handleRematch}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                <span>再戰一場</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
