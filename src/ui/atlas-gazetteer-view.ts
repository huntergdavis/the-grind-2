import { projectAtlasGazetteer, type AtlasGazetteer } from "./atlas-gazetteer";
import { projectAtlasBattleMemory, type AtlasBattleMemory } from "./atlas-battle-memory";
import type { DepthState } from "../depth/types";

/** Read-only place browsing. Selection and disclosure never enter the save. */
export function createAtlasGazetteerView(select: HTMLSelectElement, entry: HTMLElement) {
  const doc = entry.ownerDocument;
  let current: AtlasGazetteer = { places: [] };
  let battleMemory: readonly AtlasBattleMemory[] = [];
  let campaign: string | undefined;
  let entryCampaign: string | undefined;
  let optionsKey = "";
  let entryKey = "";
  function node<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className = ""): HTMLElementTagNameMap[K] {
    const element = doc.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
  }
  function presentEntry(): void {
    const place = current.places.find((candidate) => candidate.id === select.value);
    const battles = place === undefined ? [] : battleMemory.filter((battle) =>
      battle.fromLocationId === place.id || battle.destinationLocationId === place.id);
    const nextKey = JSON.stringify({ place: place ?? null, battles });
    if (nextKey === entryKey) return;
    entryKey = nextKey;
    const oldDisclosure = entry.querySelector<HTMLDetailsElement>(".gazetteer-battle-memory");
    const samePlace = entryCampaign === campaign && entry.dataset.locationId === place?.id;
    const wasOpen = samePlace && oldDisclosure?.open === true;
    const hadFocus = samePlace && oldDisclosure?.querySelector("summary") === doc.activeElement;
    const openDistricts = new Set<string>();
    let focusedDistrict: string | undefined;
    if (samePlace) {
      for (const item of entry.querySelectorAll<HTMLElement>(".gazetteer-district")) {
        if (item.querySelector("details")?.open) openDistricts.add(item.dataset.districtId!);
        if (item.querySelector("summary") === doc.activeElement) focusedDistrict = item.dataset.districtId;
      }
    }
    entryCampaign = campaign;
    entry.replaceChildren();
    delete entry.dataset.locationId;
    if (place === undefined) {
      entry.append(node("p", "No known places recorded yet."));
      return;
    }
    entry.dataset.locationId = place.id;
    entry.append(node("h2", place.name));
    entry.append(node("p", `${place.kind} · ${place.feature.replaceAll("-", " ")} · Place danger ${place.danger}`));
    if (battles.length > 0) {
      const history = node("details", "", "gazetteer-battle-memory");
      const summary = node("summary", `◇ Recorded road battles (${battles.length})`);
      const records = node("ul", "", "gazetteer-battle-records");
      for (const battle of battles) {
        const row = node("li", "");
        row.dataset.edgeId = battle.edgeId;
        row.dataset.combatId = battle.combatId;
        row.dataset.outcome = battle.outcome;
        row.append(node("strong", `${battle.fromName} — ${battle.destinationName}`),
          node("span", `${battle.speciesNames.join(", ")} · ${battle.outcome}`));
        records.append(row);
      }
      history.append(summary, node("small", "Historical road records—not current danger or a creature's present position."), records);
      history.open = wasOpen;
      entry.append(history);
      if (hadFocus) summary.focus({ preventScroll: true });
    } else if (hadFocus) select.focus({ preventScroll: true });
    const town = place.town;
    if (town === null) {
      entry.append(node("p", place.kind === "town"
        ? "Not yet visited. Local notes will appear after the hero visits."
        : "A known place on the atlas. No settlement notes are recorded here."));
      return;
    }
    entry.append(node("h3", town.name));
    entry.append(node("p", `Known for ${town.specialty} · Founded ${town.foundedYear}`));
    entry.append(node("p", `${town.visits} recorded ${town.visits === 1 ? "visit" : "visits"} · Reputation ${town.reputation}/100`));
    entry.append(node("small", "Recorded settlement roster, not a list of personal meetings or current sightings."));
    const districts = node("ul", "", "gazetteer-districts");
    for (const district of town.districts) {
      const item = node("li", "", "gazetteer-district");
      item.dataset.districtId = district.id;
      const detail = node("details", "");
      detail.open = openDistricts.has(district.id);
      detail.append(node("summary", `${district.name} · ${district.character}`));
      const buildings = node("ul", "", "gazetteer-buildings");
      for (const building of district.buildings) {
        const row = node("li", "");
        row.dataset.buildingId = building.id;
        row.append(node("strong", building.name), node("small", building.kind));
        const residents = node("ul", "", "gazetteer-residents");
        for (const resident of building.residents) {
          const person = node("li", `${resident.name} · ${resident.role} · ${resident.disposition}`);
          person.dataset.residentId = resident.id;
          person.dataset.disposition = resident.disposition;
          residents.append(person);
        }
        row.append(residents);
        buildings.append(row);
      }
      detail.append(buildings);
      item.append(detail);
      districts.append(item);
    }
    entry.append(districts);
    if (focusedDistrict !== undefined) {
      const retained = [...districts.children].find((item) => (item as HTMLElement).dataset.districtId === focusedDistrict);
      (retained?.querySelector("summary") ?? select).focus({ preventScroll: true });
    }
  }
  select.addEventListener("change", presentEntry);
  return {
    render(source: Pick<DepthState, "atlas" | "towns" | "completedCombats">, campaignId: string): void {
      current = projectAtlasGazetteer(source);
      battleMemory = projectAtlasBattleMemory(source);
      const sameCampaign = campaign === campaignId;
      const selected = sameCampaign ? select.value : "";
      if (!sameCampaign) entryKey = "";
      campaign = campaignId;
      const nextOptions = JSON.stringify(current.places.map(({ id, name }) => [id, name]));
      if (nextOptions !== optionsKey) {
        optionsKey = nextOptions;
        select.replaceChildren(...current.places.map((place) => {
          const option = node("option", place.name);
          option.value = place.id;
          return option;
        }));
      }
      select.value = current.places.some((place) => place.id === selected)
        ? selected : current.places[0]?.id ?? "";
      select.disabled = current.places.length === 0;
      presentEntry();
    },
  };
}
