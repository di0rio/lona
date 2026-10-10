import { withInternationalization } from "better-intl/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	poweredByHeader: false,
};

export default withInternationalization(nextConfig);
