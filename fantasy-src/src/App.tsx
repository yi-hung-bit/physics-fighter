/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { BattleArena } from './components/BattleArena';
import {
  BattleFormat,
  DifficultyLevel,
  PartySelectScreen,
  TurnMode,
} from './components/PartySelectScreen';
import { audio } from './utils/audio';

type ScreenState = 'PARTY_SELECT' | 'BATTLE';

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('PARTY_SELECT');
  const [format, setFormat] = useState<BattleFormat>('3v3');
  const [turnMode, setTurnMode] = useState<TurnMode>('phase');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('normal');
  const [stageId, setStageId] = useState<'academy' | 'chalkboard' | 'spacetime'>('academy');
  const [playerTeamIds, setPlayerTeamIds] = useState<string[]>([
    'newton',
    'faraday',
    'bohr',
  ]);
  const [enemyTeamIds, setEnemyTeamIds] = useState<string[]>([
    'einstein',
    'schrodinger',
    'curie',
  ]);
  const [muted, setMuted] = useState<boolean>(false);

  const handleToggleMute = () => {
    const next = !muted;
    audio.muted = next;
    setMuted(next);
  };

  if (screen === 'BATTLE') {
    return (
      <BattleArena
        format={format}
        turnMode={turnMode}
        difficulty={difficulty}
        stageId={stageId}
        playerTeamIds={playerTeamIds}
        enemyTeamIds={enemyTeamIds}
        muted={muted}
        onToggleMute={handleToggleMute}
        onReturnToSelect={() => setScreen('PARTY_SELECT')}
      />
    );
  }

  return (
    <PartySelectScreen
      format={format}
      setFormat={setFormat}
      turnMode={turnMode}
      setTurnMode={setTurnMode}
      difficulty={difficulty}
      setDifficulty={setDifficulty}
      stageId={stageId}
      setStageId={setStageId}
      playerTeamIds={playerTeamIds}
      setPlayerTeamIds={setPlayerTeamIds}
      enemyTeamIds={enemyTeamIds}
      setEnemyTeamIds={setEnemyTeamIds}
      muted={muted}
      onToggleMute={handleToggleMute}
      onStartBattle={() => setScreen('BATTLE')}
    />
  );
}
