import { defineRailway, project, service, volume } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "web";
export default defineRailway(() => {
  const data = volume("web-volume", {
    sizeMB: 500,
    region: "asia-southeast1-eqsg3a",
  });

  const web = service("web", {
    build: {
      buildEnvironment: "V3",
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { "asia-southeast1-eqsg3a": 1 },
    volumeMounts: { "/data": data },
  });

  return project("dreamy-attention-lab", {
    variables: { managed: false },
    resources: [web, data],
  });
});
