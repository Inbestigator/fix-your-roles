import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Browser } from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedExecutablePath: string | null = null;
let downloadPromise: Promise<string> | null = null;

async function getChromiumPath(): Promise<string> {
  if (cachedExecutablePath) return cachedExecutablePath;

  if (!downloadPromise) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    downloadPromise = chromium
      .executablePath("https://puppeteer-on-vercel-example.vercel.app/chromium-pack.tar")
      .then((path) => {
        cachedExecutablePath = path;
        console.log("Chromium path resolved:", path);
        return path;
      })
      .catch((error) => {
        console.error("Failed to get Chromium path:", error);
        downloadPromise = null;
        throw error;
      });
  }

  return downloadPromise;
}

export async function GET(req: Request) {
  let browser: Browser;
  let puppeteer: any;
  let launchOptions: any = { headless: true };

  if (process.env.VERCEL_ENV) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    puppeteer = await import("puppeteer-core");
    const executablePath = await getChromiumPath();
    launchOptions = { ...launchOptions, args: chromium.args, executablePath };
  } else {
    puppeteer = await import("puppeteer");
  }

  browser = await puppeteer.launch(launchOptions);

  let rolesSvg = readFileSync(join(__dirname, "../roles.svg"), "utf8");
  const url = new URL(req.url);
  const vars = {
    admin: url.searchParams.get("admin") ?? "Admin",
    adminHex: url.searchParams.get("admin-hex") ?? "e74e3d",
    bot: url.searchParams.get("bot") ?? "Bot",
    botHex: url.searchParams.get("bot-hex") ?? "9aacb5",
    mod: url.searchParams.get("mod") ?? "Moderator",
    modHex: url.searchParams.get("mod-hex") ?? "2fcc71",
    member: url.searchParams.get("member") ?? "Member",
    memberHex: url.searchParams.get("member-hex") ?? "9aacb5",
  };

  for (const [key, value] of Object.entries(vars)) {
    rolesSvg = rolesSvg.replace(`{{${key}}}`, value);
  }

  const project = JSON.parse(
    readFileSync(join(__dirname, "../excalidraw.json"), "utf8").replace(
      "{{roles-image}}",
      Buffer.from(rolesSvg, "utf8").toString("base64"),
    ),
  );

  project.appState.exportWithDarkMode = url.searchParams.has("dark");

  try {
    const page = await browser.newPage();

    const svg = await page.evaluate(async (project) => {
      // @ts-expect-error
      const { exportToSvg } = await import("https://esm.sh/@excalidraw/utils?bundle");

      const svgElement = await exportToSvg(project);

      return svgElement.outerHTML;
    }, project);

    await page.setContent(svg);

    const webp = await page
      .$("svg")
      .then((el) => el?.screenshot({ type: "webp", omitBackground: true }));

    return new Response(webp as unknown as Blob, {
      headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=3600" },
    });
  } finally {
    await browser.close();
  }
}
