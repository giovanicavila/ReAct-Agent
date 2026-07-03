import { type Static, Type } from "@sinclair/typebox";

/** Schema for the structured workload description sent to POST /api/estimate */
export const estimateRequestSchema = Type.Object(
  {
    workloadType: Type.String({
      description:
        "Type of application (e.g., SaaS, API, AI, e-commerce, mobile app). Determines the baseline architecture.",
    }),
    monthlyActiveUsers: Type.Number({
      description: "Number of unique users expected to use the application each month.",
    }),
    peakConcurrentUsers: Type.Number({
      description: "Maximum number of users connected simultaneously during peak usage.",
    }),
    requestsPerDay: Type.Number({
      description: "Estimated number of API or application requests processed per day.",
    }),
    storageGB: Type.Number({
      description: "Current amount of data that needs to be stored (in GB).",
    }),
    monthlyStorageGrowthGB: Type.Number({
      description: "Estimated increase in stored data each month (in GB).",
    }),
    databaseSizeGB: Type.Number({
      description: "Current database size (in GB).",
    }),
    outboundTrafficGBPerMonth: Type.Number({
      description:
        "Amount of data transferred from the cloud to users or external systems each month (in GB).",
    }),
    availabilityTier: Type.String({
      description:
        "Desired availability level (e.g., Development, Production, High Availability, Multi-Region).",
    }),
    trafficPattern: Type.String({
      description: "Expected traffic behavior (e.g., Constant, Business Hours, Seasonal, Spiky).",
    }),

    registeredUsers: Type.Optional(
      Type.Number({ description: "Total number of registered users, including inactive accounts." }),
    ),
    dailyActiveUsers: Type.Optional(
      Type.Number({ description: "Average number of unique users active each day." }),
    ),
    documentsCount: Type.Optional(
      Type.Number({
        description: "Total number of files, documents, or objects stored by the application.",
      }),
    ),
    averageDocumentSizeMB: Type.Optional(
      Type.Number({ description: "Average size of each stored document or file (in MB)." }),
    ),
    transactionsPerSecond: Type.Optional(
      Type.Number({
        description: "Expected number of database transactions processed per second.",
      }),
    ),
    peakRequestsPerSecond: Type.Optional(
      Type.Number({ description: "Highest expected request rate during traffic peaks." }),
    ),
    averageRequestDurationMs: Type.Optional(
      Type.Number({ description: "Average processing time of a request (in milliseconds)." }),
    ),
    cpuIntensity: Type.Optional(
      Type.Union([Type.Literal("Low"), Type.Literal("Medium"), Type.Literal("High")], {
        description: "Expected CPU usage of the workload (Low, Medium, High).",
      }),
    ),
    memoryIntensity: Type.Optional(
      Type.Union([Type.Literal("Low"), Type.Literal("Medium"), Type.Literal("High")], {
        description: "Expected memory usage of the workload (Low, Medium, High).",
      }),
    ),
    gpuRequired: Type.Optional(
      Type.Boolean({
        description:
          "Indicates whether GPU resources are required for AI, ML, rendering, or similar workloads.",
      }),
    ),
    backupRetentionDays: Type.Optional(
      Type.Number({ description: "Number of days backups should be retained." }),
    ),
    multiRegion: Type.Optional(
      Type.Boolean({
        description: "Whether the application must be deployed across multiple geographic regions.",
      }),
    ),
    compliance: Type.Optional(
      Type.String({ description: "Compliance requirements (e.g., PCI-DSS, HIPAA, GDPR, SOC 2)." }),
    ),
    serverlessPreferred: Type.Optional(
      Type.Boolean({
        description: "Indicates a preference for serverless services when suitable.",
      }),
    ),
    expectedMonthlyGrowthPercent: Type.Optional(
      Type.Number({
        description: "Estimated monthly growth rate of the workload (users, data, or traffic).",
      }),
    ),
  },
  {
    $id: "estimateRequest",
    description: "Workload description for AWS cost estimation",
    additionalProperties: false,
  },
);

export type EstimateRequest = Static<typeof estimateRequestSchema>;

/** Schema for a pre-defined services array (skips LLM) */
export const servicesArraySchema = Type.Array(
  Type.Object({
    serviceName: Type.String(),
    quantity: Type.Optional(Type.Number({ default: 1 })),
    description: Type.Optional(Type.String()),
  }),
);

export type ServicesArray = Static<typeof servicesArraySchema>;

/** Schema for the flexible JSON body (architecture text + optional services) */
export const architectureBodySchema = Type.Object({
  architecture: Type.String({
    description: "Natural language description of the application architecture.",
  }),
  services: Type.Optional(servicesArraySchema),
});

export type ArchitectureBody = Static<typeof architectureBodySchema>;
