// Curated moments: a short guided tour through the map. Each sets the year and view, and selects a polity.
import type { HistoryMap } from './map';
import { store } from './store';
import { formatYear } from './years';

interface Moment {
  year: number;
  title: string;
  caption: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  /** Polity to select, and a spot inside it (for "history of this place"). */
  pid?: string;
  at?: [number, number];
}

export const MOMENTS: Moment[] = [
  { year: -10000, title: 'Into the Americas', caption: 'As the ice sheets retreat, the first peoples of the Americas hunt mammoth and bison south of the ice.', center: [-90, 25], zoom: 2.2, pid: 'paleo-indians', at: [-98, 35] },
  { year: -8000, title: 'The first farmers', caption: 'In the Fertile Crescent, villages such as Jericho and Göbekli Tepe begin to grow wheat and herd goats.', center: [40, 34], zoom: 4.3, pid: 'pre-pottery-neolithic-farmers', at: [38.5, 36.5] },
  { year: -6000, title: 'A green Sahara', caption: 'Rains turn the Sahara into grassland with lakes. Hunters and cattle herders live where there is desert today.', center: [10, 22], zoom: 3, pid: 'green-sahara-hunters-and-herders', at: [10, 22] },
  { year: -2600, title: 'The first cities', caption: 'Sumer, Egypt and the Indus Valley build cities, writing and monuments, while farming spreads across Europe and China.', center: [55, 28], zoom: 3.4, pid: 'indus-valley-civilization', at: [69, 27] },
  { year: -2250, title: "Sargon's Akkadian Empire", caption: 'Sargon of Akkad unites the Sumerian cities into what is often called the first empire.', center: [44, 33], zoom: 4.8, pid: 'akkadian-empire', at: [44.5, 33] },
  { year: -1300, title: 'Bronze Age powers', caption: "New Kingdom Egypt and the Hittites compete for the Levant, while Mycenaean Greece trades across the Aegean.", center: [33, 34], zoom: 4.2, pid: 'new-kingdom-of-egypt', at: [31.5, 27] },
  { year: -1250, title: 'Shang China', caption: 'The Shang rule the Yellow River valley, casting bronze vessels and writing on oracle bones.', center: [113, 35], zoom: 4.5, pid: 'shang-dynasty', at: [114.3, 36] },
  { year: -660, title: 'Assyria at its height', caption: 'The Neo-Assyrian Empire stretches from Egypt to Iran, ruled from Nineveh.', center: [42, 33], zoom: 4, pid: 'neo-assyrian-empire', at: [43.2, 36.4] },
  { year: -490, title: 'The Persian Empire', caption: 'The Achaemenid Empire is the largest the world has seen, from the Aegean to the Indus.', center: [50, 32], zoom: 3.4, pid: 'achaemenid-empire', at: [53, 32] },
  { year: -323, title: 'Alexander the Great', caption: 'Alexander dies in Babylon, having conquered Persia in eleven years. His generals divide the empire.', center: [44, 33], zoom: 3.4, pid: 'macedonian-empire', at: [44.4, 32.5] },
  { year: -250, title: "Ashoka's India", caption: 'The Maurya Empire covers most of South Asia; Ashoka spreads Buddhism after the bloody war in Kalinga.', center: [80, 23], zoom: 3.8, pid: 'maurya-empire', at: [80, 24] },
  { year: -210, title: 'The first emperor of China', caption: 'Qin Shi Huang unifies China, standardising writing, coins and weights, and builds early walls.', center: [110, 33], zoom: 4, pid: 'qin-dynasty', at: [109, 34.3] },
  { year: 117, title: 'Rome and Han', caption: 'Two empires at their peak, linked by the Silk Road through Parthia and the Kushans.', center: [62, 35], zoom: 2.3, pid: 'roman-empire', at: [12.5, 41.9] },
  { year: 400, title: 'Teotihuacan', caption: 'One of the largest cities in the world, with some 100,000 people, dominates central Mexico.', center: [-96, 18], zoom: 5, pid: 'teotihuacan', at: [-98.84, 19.69] },
  { year: 476, title: 'The end of Rome in the West', caption: 'The last western emperor is deposed. Germanic kingdoms take over, while the Eastern Empire carries on.', center: [12, 44], zoom: 3.8, pid: 'eastern-roman-empire', at: [32, 39.5] },
  { year: 450, title: 'Gupta India', caption: "The Gupta period, often called India's classical age, in science, art and literature.", center: [80, 23], zoom: 4, pid: 'gupta-empire', at: [81, 25] },
  { year: 736, title: 'The Umayyad Caliphate', caption: 'A century after Muhammad, Arab armies have built an empire from Spain to Central Asia.', center: [25, 30], zoom: 2.8, pid: 'umayyad-caliphate', at: [36.3, 33.5] },
  { year: 700, title: 'Tang China', caption: 'The Tang capital Chang’an is perhaps the largest city on earth, at the eastern end of the Silk Road.', center: [100, 37], zoom: 3.3, pid: 'tang-dynasty', at: [108.9, 34.3] },
  { year: 814, title: 'Charlemagne', caption: 'Charlemagne, crowned emperor in 800, rules most of western Europe.', center: [8, 47], zoom: 4.4, pid: 'carolingian-empire', at: [6.1, 50.8] },
  { year: 1000, title: 'The world in 1000', caption: 'Vikings reach Newfoundland, the Song rule China, and the Fatimids rule Egypt from Cairo.', center: [30, 35], zoom: 1.6 },
  { year: 1279, title: 'The Mongol Empire', caption: 'The largest contiguous land empire in history, from Korea to Hungary.', center: [80, 45], zoom: 2.6, pid: 'mongol-empire', at: [103, 47] },
];

export function initMoments(hm: HistoryMap, stopPlayback: () => void) {
  const button = document.getElementById('moments-btn') as HTMLButtonElement;
  const list = document.getElementById('moments-list') as HTMLUListElement;
  const card = document.getElementById('moment-card')!;
  const sorted = [...MOMENTS].sort((a, b) => a.year - b.year);
  let current = -1;

  list.innerHTML = sorted
    .map(
      (m, i) => `<li><button class="moment-item" data-i="${i}"><span class="m-year">${formatYear(m.year)}</span><span class="m-title">${m.title}</span></button></li>`,
    )
    .join('');

  const open = (on: boolean) => {
    list.hidden = !on;
    button.setAttribute('aria-expanded', String(on));
  };
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    open(list.hidden !== false);
  });
  document.addEventListener('click', (e) => {
    if (!list.hidden && !list.contains(e.target as Node)) open(false);
  });

  const show = (i: number) => {
    const m = sorted[i];
    current = i;
    stopPlayback();
    store.setYear(m.year);
    hm.map.flyTo({ center: m.center, zoom: m.zoom, duration: 1800, essential: true });
    store.select(m.pid ? { pid: m.pid, lngLat: m.at ?? m.center } : null);
    card.innerHTML = `
      <button class="mc-nav" data-d="-1" aria-label="Previous moment" ${i === 0 ? 'disabled' : ''}>‹</button>
      <div class="mc-body">
        <div class="mc-title"><span class="m-year">${formatYear(m.year)}</span> ${m.title}</div>
        <div class="mc-caption">${m.caption}</div>
      </div>
      <button class="mc-nav" data-d="1" aria-label="Next moment" ${i === sorted.length - 1 ? 'disabled' : ''}>›</button>
      <button class="mc-close" aria-label="Close">×</button>`;
    card.hidden = false;
    card.querySelectorAll<HTMLButtonElement>('.mc-nav').forEach((b) => b.addEventListener('click', () => show(current + Number(b.dataset.d))));
    card.querySelector('.mc-close')!.addEventListener('click', () => (card.hidden = true));
  };

  list.querySelectorAll<HTMLButtonElement>('.moment-item').forEach((b) =>
    b.addEventListener('click', () => {
      open(false);
      show(Number(b.dataset.i));
    }),
  );
}
