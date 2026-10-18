import { withInternationalization } from "better-intl/next";
import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	poweredByHeader: false,
	env: { NEXT_PUBLIC_BOTID: process.env.VERCEL ? "on" : "off" },
};

export default withInternationalization(withBotId(nextConfig));
