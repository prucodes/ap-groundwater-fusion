/* Lines from the epics that sit beside the work, one to a page. The Sanskrit is given in
   Telugu script, as it is read in Andhra Pradesh; the English is this site's own rendering.
   Verse numbers follow the Gita Press and Pune critical editions, which agree on these. */

export type Verse = {
  id: string;
  /** The Sanskrit in Telugu script, one line per half-verse. Absent for a passage told in prose. */
  telugu?: string[];
  english: string;
  speaker?: string;
  source: string;
};

export const VERSES = {
  // Narada's questions to a new king on how his kingdom is run.
  narada: {
    id: "narada",
    telugu: ["కచ్చిద్ రాష్ట్రే తడాగాని పూర్ణాని చ బృహన్తి చ ।", "భాగశో వినివిష్టాని న కృషిర్దేవమాతృకా ॥"],
    english: "Are there great tanks across your kingdom, full of water and set in every part, so that farming is not left to the rain alone?",
    speaker: "Narada to Yudhishthira",
    source: "Mahabharata, Sabha Parva 5",
  },
  // Krishna, at the end of the Gita, leaves the choice with Arjuna.
  reflect: {
    id: "reflect",
    telugu: ["ఇతి తే జ్ఞానమాఖ్యాతం గుహ్యాద్గుహ్యతరం మయా ।", "విమృశ్యైతదశేషేణ యథేచ్ఛసి తథా కురు ॥"],
    english: "I have set this knowledge before you. Reflect on all of it, then do as you choose.",
    speaker: "Krishna to Arjuna",
    source: "Bhagavad Gita 18.63",
  },
  rain: {
    id: "rain",
    telugu: ["తపామ్యహమహం వర్షం నిగృహ్ణామ్యుత్సృజామి చ ।"],
    english: "I give the heat. I hold back the rain, and I send it.",
    speaker: "Krishna",
    source: "Bhagavad Gita 9.19",
  },
  bhishma: {
    id: "bhishma",
    english: "At Kurukshetra, Bhishma lay on his bed of arrows and asked for water. Arjuna drove an arrow into the earth, and cool, clear water rose from beneath.",
    source: "Mahabharata, Bhishma Parva",
  },
  yaksha: {
    id: "yaksha",
    english: "A voice at the forest lake asked the thirsty Pandavas to answer its questions before they drank. Only Yudhishthira stopped to answer.",
    speaker: "The Yaksha's questions",
    source: "Mahabharata, Vana Parva",
  },
} satisfies Record<string, Verse>;
