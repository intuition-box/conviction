export type RankingConfig = {
  slug: string;
  label: string;
  predicateTermId: string;
  objectTermId: string;
  themeSlug: string;
  themeAtomTermId: string | null;
};

const IS_THE_BEST = "0x9801897b84be4bd6b059b9c0bbd6882ef461c771861ffd500c285561d455af3e";
const SOCIAL_MEDIA_ATOM = "0x71ab7105ca0f9b8e2ad1c39016eb642e638f92f7ba3ae9b82ae11b2e794b5a9a";

export const RANKINGS: RankingConfig[] = [
  {
    slug: "social-media",
    label: "Social Media",
    predicateTermId: IS_THE_BEST,
    objectTermId: SOCIAL_MEDIA_ATOM,
    themeSlug: "social-media",
    themeAtomTermId: SOCIAL_MEDIA_ATOM,
  },
];

export const FEATURED_RANKING = RANKINGS[0];
