// historical-basemaps does not say whether a shape is a state or a people/culture,
// so we guess from the name. Cultures are drawn paler, with italic labels.

const STATE_WORDS =
  /\b(empire|kingdoms?|dynast(y|ies)|caliphate|emirates?|khanate|khaganate|sultanate|republic|duch(y|ies)|principalit(y|ies)|states?|city-states|commonwealth|league|chiefdoms|confederation|shahis)\b/i;

const CULTURE_WORDS =
  /(culture|cultures|complex|focus|hunter|gatherer|forager|farmers|nomad|pastoral|peoples?\b|tribes|aborigin|fishers|fichers|horticult|mammal|bison|neolithic|mesolithic|bronze age|iron age|megalith|burials)/i;

// Ethnonyms and archaeological cultures that the name pattern above misses.
const PEOPLES = new Set(
  `Ainu Akatziri Alamans Alans Anglo-Saxons Arabs Arameans Arawaks Athabaskan Austronesians Avars Azandes Balts Bantu
  Bashkirs Basques Beaker Bedouins Beothuk Berbers Blemmyes Boethuk Boii Bulgars Burgundians Celtiberians Celts Chinchoros
  Chorrera Chuds Ciboney Cimerians Curonians Cushites Cycladic Czechs Dacians Danes Dorset Dravidians Ests Finns Frisians
  Geats Gepids Goths Guanahatabeyes Guanches Guta Heruli Huns Illyrians Innu Jōmon Karelians Khoisan Koreans Kryvichs Kurs
  Kurykans Kushites Magyars Malagasy Malay Malays Mandes Mauri Minoan Mixtecs Mon-Khmer Moravians Mordvinians Norsemen
  Northmen Oghuz Olmec Ostrogoths Paleo-Inuit Paleo-Koreans Papuan Papuans Pechenegs Permians Peshemegs Phrygians Picts
  Polanes Polyanians Polynesians Proto-Slavs Prussians Saami Sabines Sabini Sabirs Saces Samis Sami Sámi Samnites Samoyèdes
  Sarmates Saxons Scots Scythians Semites Severians Sinic Skirii Slavs Suebi Swedes Taino Thai Thule Tibetans
  Tibeto-Burmanese Tuaregs Tungus Tupis Turingians Uyghurs Vandals Vazimba Veps Visigoths Welsh Yayoi Yuezhi Únětice
  Afanasevo Andronovo Karasuk Namazga Sintashta Valdivia Wankarani Chavin Paracas Copena Miller Porter Laurel Armorica`
    .split(/\s+/)
    .filter(Boolean),
);

export function looksLikeCulture(name: string): boolean {
  if (STATE_WORDS.test(name)) return false;
  if (CULTURE_WORDS.test(name)) return true;
  return PEOPLES.has(name) || PEOPLES.has(name.replace(/ (Turks|tribes)$/, ''));
}

// Names that describe a way of life ("Amazon hunter-gatherers", "Saharan pastoral nomads") rather than
// a specific people or archaeological culture. These stay valid for a long time.
const LIFEWAY = /(hunter|gatherer|forager|farmers|nomad|pastoral|fishers|fichers|mammal|bison|aborigin|horticult|peoples\b|tribes\b)/i;

export function isLifeway(name: string): boolean {
  return LIFEWAY.test(name);
}
