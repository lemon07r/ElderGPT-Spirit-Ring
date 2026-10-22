import type { ModAPI, RootState } from 'afnm-types';
import type { SectContext } from './contextTypes';
import { asDisplayString } from './displayText';

export function extractSectContext(
  snapshot: RootState,
  gameData: ModAPI['gameData'] | undefined,
): SectContext | null {
  if (!snapshot.sect) return null;

  // Currency identities come from the vault definitions, not item-name guesses.
  const slipNames = new Set<string>();
  for (const location of Object.values(gameData?.locations ?? {})) {
    for (const building of location.buildings ?? []) {
      if (building.kind === 'vault') {
        for (const slip of Object.values(building.slips)) slipNames.add(slip.name);
      }
    }
  }
  const vaultSlips = new Map<string, number>();
  for (const item of snapshot.inventory.items ?? []) {
    if (slipNames.has(item.name) && item.stacks > 0) {
      vaultSlips.set(item.name, (vaultSlips.get(item.name) ?? 0) + item.stacks);
    }
  }

  // Accepted missions are stored on location buildings; only include live quests.
  const accepted = new Set<string>();
  for (const location of Object.values(snapshot.location.locations ?? {})) {
    for (const building of Object.values(location.buildingState ?? {})) {
      if (building.kind === 'mission') {
        for (const mission of [...building.accepted, ...(building.craftingAccepted ?? [])]) {
          accepted.add(mission.quest);
        }
      }
    }
  }
  const missions = (snapshot.quests.quests ?? []).filter((quest) => accepted.has(quest.name));
  const services = (snapshot.sect.services ?? []).filter((service) => service.status !== 'collected');

  return {
    rank: snapshot.sect.rank,
    vaultSlips: [...vaultSlips].map(([name, stacks]) => ({ name, stacks })),
    missionCount: missions.length,
    missions: missions.slice(0, 5).map((quest) => ({
      name: asDisplayString(gameData?.quests?.[quest.name]?.displayName, quest.name),
      completedSteps: quest.completed.length,
      deadlineMonth: quest.deadlineMonth ?? null,
    })),
    serviceCount: services.length,
    services: services.slice(0, 5).map((service) => ({
      kind: service.kind,
      status: service.status,
      target: service.kind === 'materialRequest' ? service.itemName
        : service.kind === 'commissionCrafting' ? service.recipeName : service.item.name,
    })),
  };
}
