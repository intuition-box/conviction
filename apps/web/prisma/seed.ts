import path from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

loadEnv({ path: path.join(__dirname, "..", ".env") });

if (process.env.NODE_ENV === "production") {
  console.log("Seed skipped in production.");
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set for seed.");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

// Real on-chain Intuition triple term IDs — distributed across posts
const TRIPLE_IDS = [
  "0xc4e64dbc3d69293d28259653d9b15d2ab3f6aa1aa0b1a489e5250974cd089730",
  "0xb301f076ea5d81e049e5fc1bb47ee6cdf089ce79c86376053e9a2ff7f3058b7d",
  "0xcdf1ef9701bc206d6a655d75292757c9dd3e367a9c837c2feaa70550b429efe2",
  "0xa1739235f5a8362b15268eab46484abdd7660a1e2a6a5d7deacbed9d4c055e68",
  "0x3ace992ee16ac3902c0ee6330165de2a1024b569e78bc96e0c413aa2a608e051",
  "0x3cdca4b3d5b5585335f4c232d5e7aaf1588d367aeb63545cb4790e51f0cb79e7",
  "0x3e59912fb066b69c79eed63dbe5ce321c83d86dd9c0472e939371c2e030907a8",
  "0x0ec37c5f71bb27e3471755288e2f2e2c43cb67367ac3df8073ca45572512a8f3",
  "0xe7cb0ac06762cfd48f7c8c296c42935519ba84a97baaffb0860f80d15f900217",
] as const;

const TERM_ID_REGEX = /^0x[0-9a-fA-F]{64}$/;

function pickTriple(index: number): string {
  const id = TRIPLE_IDS[index % TRIPLE_IDS.length];
  if (!TERM_ID_REGEX.test(id)) {
    throw new Error(`Invalid Intuition triple term ID at index ${index}: ${id}`);
  }
  return id;
}

async function main() {
  // ============================================
  // 0) CLEAN SLATE — delete in FK-safe order
  // ============================================
  await prisma.submission.deleteMany();
  await prisma.postTripleLink.deleteMany();
  await prisma.post.deleteMany();

  // ============================================
  // 1) USERS
  // ============================================
  const alice = await prisma.user.upsert({
    where: { address: "0xAlice1234567890abcdef" },
    update: {},
    create: { address: "0xAlice1234567890abcdef", displayName: "Alice" },
  });

  const bob = await prisma.user.upsert({
    where: { address: "0xBob1234567890abcdef" },
    update: {},
    create: { address: "0xBob1234567890abcdef", displayName: "Bob" },
  });

  const charlie = await prisma.user.upsert({
    where: { address: "0xCharlie1234567890abcdef" },
    update: {},
    create: { address: "0xCharlie1234567890abcdef", displayName: "Charlie" },
  });

  // ============================================
  // 2) THEMES
  // ============================================
  for (const t of [
    { slug: "politics", name: "Politics", description: "Political debates and governance" },
    { slug: "ai", name: "AI & Machine Learning", description: "Artificial intelligence and its impact" },
    { slug: "climate", name: "Climate Change", description: "Environmental and climate policy" },
    { slug: "economy", name: "Economy", description: "Economic policy and markets" },
    { slug: "tech", name: "Technology", description: "Technology and innovation" },
  ]) {
    await prisma.theme.upsert({
      where: { slug: t.slug },
      update: {},
      create: t,
    });
  }

  // ============================================
  // 3) ROOT POSTS (6)
  // ============================================
  const rootPosts = [
    {
      id: "post_ubi",
      themeSlug: "politics",
      userId: alice.id,
      body: "Universal basic income should be implemented nationwide.",
      publishedAt: new Date("2026-02-10T10:00:00Z"),
    },
    {
      id: "post_ai_reg",
      themeSlug: "ai",
      userId: bob.id,
      body: "AI systems should be regulated like critical infrastructure.",
      publishedAt: new Date("2026-02-10T11:00:00Z"),
    },
    {
      id: "post_climate_carbon",
      themeSlug: "climate",
      userId: alice.id,
      body: "Carbon pricing is the most effective tool to combat climate change.",
      publishedAt: new Date("2026-02-10T12:00:00Z"),
    },
    {
      id: "post_economy_crypto",
      themeSlug: "economy",
      userId: charlie.id,
      body: "Cryptocurrencies will become mainstream payment methods within 5 years.",
      publishedAt: new Date("2026-02-10T13:00:00Z"),
    },
    {
      id: "post_tech_privacy",
      themeSlug: "tech",
      userId: bob.id,
      body: "End-to-end encryption should be mandatory for all messaging apps.",
      publishedAt: new Date("2026-02-10T14:00:00Z"),
    },
    {
      id: "post_tech_opensource",
      themeSlug: "tech",
      userId: alice.id,
      body: "All government software should be open source by default.",
      publishedAt: new Date("2026-02-11T10:00:00Z"),
    },
  ];

  for (const p of rootPosts) {
    await prisma.post.upsert({ where: { id: p.id }, update: {}, create: p });
  }

  // ============================================
  // 4) REPLY POSTS (15) — with stances via Submissions
  // ============================================
  const replies: Array<{
    id: string;
    themeSlug: string;
    userId: string;
    body: string;
    parentPostId: string;
    publishedAt: Date;
    stance: "SUPPORTS" | "REFUTES";
  }> = [
    // — UBI debate (3 replies)
    {
      id: "reply_ubi_supports",
      themeSlug: "politics",
      userId: bob.id,
      body: "UBI can reduce extreme poverty and smooth economic shocks during recessions.",
      parentPostId: "post_ubi",
      publishedAt: new Date("2026-02-12T09:00:00Z"),
      stance: "SUPPORTS",
    },
    {
      id: "reply_ubi_refutes",
      themeSlug: "politics",
      userId: charlie.id,
      body: "UBI may reduce labor participation without targeted safeguards for able-bodied workers.",
      parentPostId: "post_ubi",
      publishedAt: new Date("2026-02-12T10:00:00Z"),
      stance: "REFUTES",
    },
    // — AI regulation debate (3 replies)
    {
      id: "reply_ai_supports",
      themeSlug: "ai",
      userId: alice.id,
      body: "Regulation ensures AI safety and prevents misuse in critical sectors like healthcare and finance.",
      parentPostId: "post_ai_reg",
      publishedAt: new Date("2026-02-12T11:00:00Z"),
      stance: "SUPPORTS",
    },
    {
      id: "reply_ai_refutes",
      themeSlug: "ai",
      userId: charlie.id,
      body: "Heavy regulation will stifle innovation and push AI development offshore to less regulated markets.",
      parentPostId: "post_ai_reg",
      publishedAt: new Date("2026-02-12T15:00:00Z"),
      stance: "REFUTES",
    },
    // — Carbon pricing debate (2 replies)
    {
      id: "reply_climate_supports",
      themeSlug: "climate",
      userId: bob.id,
      body: "Revenue-neutral carbon taxes have proven effective in British Columbia and Sweden.",
      parentPostId: "post_climate_carbon",
      publishedAt: new Date("2026-02-13T10:00:00Z"),
      stance: "SUPPORTS",
    },
    {
      id: "reply_climate_refutes",
      themeSlug: "climate",
      userId: charlie.id,
      body: "Carbon pricing disproportionately burdens low-income households without meaningful climate impact.",
      parentPostId: "post_climate_carbon",
      publishedAt: new Date("2026-02-13T11:00:00Z"),
      stance: "REFUTES",
    },

    // — Crypto debate (3 replies)
    {
      id: "reply_crypto_supports",
      themeSlug: "economy",
      userId: alice.id,
      body: "Stablecoins already process billions in daily transactions across emerging markets.",
      parentPostId: "post_economy_crypto",
      publishedAt: new Date("2026-02-13T12:00:00Z"),
      stance: "SUPPORTS",
    },
    {
      id: "reply_crypto_refutes",
      themeSlug: "economy",
      userId: bob.id,
      body: "Volatility and regulatory uncertainty make crypto unsuitable for everyday payments.",
      parentPostId: "post_economy_crypto",
      publishedAt: new Date("2026-02-13T14:00:00Z"),
      stance: "REFUTES",
    },
    // — Encryption debate (2 replies)
    {
      id: "reply_privacy_supports",
      themeSlug: "tech",
      userId: charlie.id,
      body: "Privacy is a fundamental right that encryption directly protects from mass surveillance.",
      parentPostId: "post_tech_privacy",
      publishedAt: new Date("2026-02-14T10:00:00Z"),
      stance: "SUPPORTS",
    },
    {
      id: "reply_privacy_refutes",
      themeSlug: "tech",
      userId: alice.id,
      body: "Mandatory encryption can shield criminal activity from lawful investigation.",
      parentPostId: "post_tech_privacy",
      publishedAt: new Date("2026-02-14T11:00:00Z"),
      stance: "REFUTES",
    },

    // — Open source debate (2 replies)
    {
      id: "reply_opensource_supports",
      themeSlug: "tech",
      userId: bob.id,
      body: "Open source increases transparency and public trust in government digital services.",
      parentPostId: "post_tech_opensource",
      publishedAt: new Date("2026-02-14T14:00:00Z"),
      stance: "SUPPORTS",
    },
  ];

  for (const r of replies) {
    const { stance, ...postData } = r;
    await prisma.post.upsert({
      where: { id: r.id },
      update: {},
      create: { ...postData, stance },
    });
  }

  // ============================================
  // 5) TRIPLE LINKS — cycle through the 9 Intuition IDs
  // ============================================
  const tripleLinks: Array<{
    postId: string;
    tripleIndex: number;
    role: "MAIN" | "SUPPORTING";
  }> = [
    // Root posts — MAIN
    { postId: "post_ubi", tripleIndex: 0, role: "MAIN" },
    { postId: "post_ai_reg", tripleIndex: 2, role: "MAIN" },
    { postId: "post_climate_carbon", tripleIndex: 4, role: "MAIN" },
    { postId: "post_economy_crypto", tripleIndex: 6, role: "MAIN" },
    { postId: "post_tech_privacy", tripleIndex: 7, role: "MAIN" },
    { postId: "post_tech_opensource", tripleIndex: 8, role: "MAIN" },

    // Replies — MAIN (each reply gets a different triple)
    { postId: "reply_ubi_supports", tripleIndex: 1, role: "MAIN" },
    { postId: "reply_ubi_refutes", tripleIndex: 3, role: "MAIN" },
    { postId: "reply_ai_supports", tripleIndex: 8, role: "MAIN" },
    { postId: "reply_ai_refutes", tripleIndex: 0, role: "MAIN" },
    { postId: "reply_climate_supports", tripleIndex: 7, role: "MAIN" },
    { postId: "reply_climate_refutes", tripleIndex: 2, role: "MAIN" },
    { postId: "reply_crypto_supports", tripleIndex: 4, role: "MAIN" },
    { postId: "reply_crypto_refutes", tripleIndex: 1, role: "MAIN" },
    { postId: "reply_privacy_supports", tripleIndex: 5, role: "MAIN" },
    { postId: "reply_privacy_refutes", tripleIndex: 8, role: "MAIN" },
    { postId: "reply_opensource_supports", tripleIndex: 0, role: "MAIN" },
  ];

  const baseTime = new Date("2026-02-17T10:00:00Z").getTime();

  for (let i = 0; i < tripleLinks.length; i++) {
    const link = tripleLinks[i];
    const termId = pickTriple(link.tripleIndex);
    const createdAt = new Date(baseTime + i * 1000);

    await prisma.postTripleLink.upsert({
      where: { postId_termId: { postId: link.postId, termId } },
      update: { createdAt, role: link.role },
      create: { postId: link.postId, termId, createdAt, role: link.role },
    });
  }

  // ============================================
  // 6) SUBMISSIONS — one per reply (published) + 1 draft
  // ============================================
  for (const r of replies) {
    await prisma.submission.upsert({
      where: { id: `submission_${r.id}` },
      update: {},
      create: {
        id: `submission_${r.id}`,
        userId: r.userId,
        themeSlug: r.themeSlug,
        parentPostId: r.parentPostId,
        stance: r.stance,
        inputText: r.body,
        status: "PUBLISHED",
        publishedPostId: r.id,
      },
    });
  }

  // Backfill originSubmissionId on reply posts (submissions created above)
  for (const r of replies) {
    await prisma.post.update({
      where: { id: r.id },
      data: { originSubmissionId: `submission_${r.id}` },
    });
  }

  // Draft submission (not yet published)
  await prisma.submission.upsert({
    where: { id: "submission_draft_1" },
    update: {},
    create: {
      id: "submission_draft_1",
      userId: charlie.id,
      themeSlug: "ai",
      parentPostId: "post_ai_reg",
      stance: "REFUTES",
      inputText: "Self-regulation by AI companies has historically failed in every industry.",
      status: "DRAFT",
    },
  });

  console.log("Seed data created successfully!");
  console.log("Summary:");
  console.log("  - 3 Users (Alice, Bob, Charlie)");
  console.log("  - 5 Themes");
  console.log(`  - ${rootPosts.length} Root posts`);
  console.log(`  - ${replies.length} Reply posts (${replies.filter((r) => r.stance === "SUPPORTS").length} supports, ${replies.filter((r) => r.stance === "REFUTES").length} refutes)`);
  console.log(`  - ${tripleLinks.length} PostTripleLinks (${tripleLinks.filter((l) => l.role === "MAIN").length} MAIN, ${tripleLinks.filter((l) => l.role === "SUPPORTING").length} SUPPORTING)`);
  console.log(`  - ${replies.length + 1} Submissions (${replies.length} published, 1 draft)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
