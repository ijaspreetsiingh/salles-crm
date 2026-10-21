import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";
import { ROLE_DEFS } from "../domain/rbac";
import { MODULES } from "../domain/modules";
import { sha256, stringifyJson } from "../lib/utils";
import { env } from "../config/env";
import {
  BRANCH_SEED,
  buildModuleRecords,
  EMPLOYEE_SEED,
  INTEGRATION_SEED,
  isoOffset,
  MESSAGE_SEED,
  ORG_SEED,
  PEOPLE,
  PLAN_SEED,
  RECORD_MODULES,
  TASK_SEED,
  taskDate,
  TEMPLATE_SEED,
  WORKFLOW_SEED,
} from "./seed-data";
import { buildChainConversations, buildChainRecords, buildChainTasks } from "./seed-chains";

const ORG_SLUG = "horizon-travel";

async function seedPlans() {
  for (const plan of PLAN_SEED) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      update: {
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        features: stringifyJson(plan.features),
        limits: stringifyJson(plan.limits),
        popular: plan.popular,
        position: plan.position,
      },
      create: {
        key: plan.key,
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        features: stringifyJson(plan.features),
        limits: stringifyJson(plan.limits),
        popular: plan.popular,
        position: plan.position,
      },
    });
  }
}

export async function seed(options: { reset?: boolean } = {}): Promise<void> {
  await seedPlans();

  const existing = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
  if (existing) {
    if (!options.reset) {
      console.log(`✓ Demo organisation "${ORG_SEED.name}" already seeded — skipping.`);
      return;
    }
    // Wipe the tenant so the demo can be rebuilt with fresh, connected data.
    console.log("→ Resetting the demo organisation …");
    const seedEmails = [
      env.SEED_OWNER_EMAIL,
      ...EMPLOYEE_SEED.map((e) => e.email),
    ].filter(Boolean);
    await prisma.organization.delete({ where: { id: existing.id } });
    // Users are not owned by the organisation row, so clear the demo accounts
    // explicitly before recreating them.
    await prisma.user.deleteMany({ where: { email: { in: seedEmails } } });
  }

  console.log("→ Seeding demo organisation …");

  const organization = await prisma.organization.create({
    data: {
      name: ORG_SEED.name,
      slug: ORG_SLUG,
      legalName: ORG_SEED.legalName,
      gstin: ORG_SEED.gstin,
      supportEmail: ORG_SEED.supportEmail,
      phone: ORG_SEED.phone,
      address: ORG_SEED.address,
      currency: ORG_SEED.currency,
      financialYear: ORG_SEED.financialYear,
      plan: "enterprise",
      planStatus: "active",
      settings: stringifyJson({
        taxRegime: "GST",
        defaultTaxRate: 18,
        invoicePrefix: "HT-INV-",
        security: { twoFactor: true, maskSensitive: true, quietHours: false },
      }),
    },
  });

  // Branches
  const branchMap = new Map<string, string>();
  for (const name of BRANCH_SEED) {
    const branch = await prisma.branch.create({
      data: { organizationId: organization.id, name, code: name.slice(0, 3).toUpperCase() },
    });
    branchMap.set(name, branch.id);
  }

  // Roles
  for (const role of ROLE_DEFS) {
    await prisma.role.create({
      data: {
        organizationId: organization.id,
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: stringifyJson(role.permissions),
        isSystem: role.isSystem,
      },
    });
  }

  // Users + memberships
  const ownerPassword = env.SEED_OWNER_PASSWORD;
  const userMap = new Map<string, string>();
  for (const [index, employee] of EMPLOYEE_SEED.entries()) {
    const email = index === 0 ? env.SEED_OWNER_EMAIL : employee.email;
    const user = await prisma.user.create({
      data: {
        email,
        name: employee.name,
        phone: `+91 98${index}00 12${index}45`,
        passwordHash: await hashPassword(ownerPassword),
        active: employee.active,
      },
    });
    userMap.set(employee.name, user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        roleKey: employee.roleKey,
        branchId: branchMap.get(employee.branch) ?? null,
        active: true,
      },
    });
  }

  // Workspace records for every record-backed module
  const records = RECORD_MODULES.flatMap((module) =>
    buildModuleRecords(module).map((record) => ({
      ...record,
      organizationId: organization.id,
      ownerId: userMap.get(record.ownerName) ?? null,
      branchId: branchMap.get(record.branchName) ?? null,
      extra: stringifyJson({}),
      meta: stringifyJson({}),
    })),
  );

  // Connected business chains — ten real traveller stories where an enquiry
  // becomes a quotation, a booking, a visa, an invoice and a support ticket.
  // Every record names the one before it, so the journey view has content.
  const chainRecords = buildChainRecords(RECORD_MODULES).map(({ dateOffset, ...record }) => ({
    ...record,
    organizationId: organization.id,
    ownerId: userMap.get(record.ownerName) ?? null,
    branchId: branchMap.get(record.branchName) ?? null,
    date: isoOffset(dateOffset),
    extra: stringifyJson(record.extra),
    meta: stringifyJson({}),
  }));
  await prisma.record.createMany({ data: [...records, ...chainRecords] });

  // Tasks
  await prisma.task.createMany({
    data: TASK_SEED.map((task, i) => ({
      organizationId: organization.id,
      title: task.title,
      type: task.type,
      ownerName: EMPLOYEE_SEED[i % EMPLOYEE_SEED.length]!.name,
      ownerId: userMap.get(EMPLOYEE_SEED[i % EMPLOYEE_SEED.length]!.name) ?? null,
      date: taskDate(task.offset),
      priority: task.priority,
      done: task.done,
    })),
  });

  // Tasks that belong to the chains above
  const chainTaskRecords = buildChainTasks();
  await prisma.task.createMany({
    data: chainTaskRecords.map((task) => ({
      organizationId: organization.id,
      title: task.title,
      type: task.type,
      ownerName: task.owner,
      ownerId: userMap.get(task.owner) ?? null,
      date: taskDate(task.offset),
      priority: task.priority,
      done: task.done,
      relatedModule: task.relatedModule,
    })),
  });

  // Workflows
  for (const workflow of WORKFLOW_SEED) {
    await prisma.workflow.create({
      data: {
        organizationId: organization.id,
        name: workflow.name,
        moduleId: "leads",
        trigger: workflow.trigger,
        condition: workflow.condition,
        action: workflow.action,
        status: workflow.status,
        runCount: Math.floor(Math.random() * 90) + 5,
        lastRunAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
      },
    });
  }

  // Integrations
  for (const integration of INTEGRATION_SEED) {
    await prisma.integrationConnection.create({
      data: {
        organizationId: organization.id,
        provider: integration.provider,
        category: integration.category,
        description: integration.description,
        environment: "Sandbox",
        status: "Not connected",
        config: stringifyJson({}),
      },
    });
  }

  // Message templates
  for (const template of TEMPLATE_SEED) {
    await prisma.messageTemplate.create({
      data: { organizationId: organization.id, channel: template.channel, name: template.name, body: template.body },
    });
  }

  // Shared inbox conversations built from the demo customer base
  for (const [i, name] of PEOPLE.entries()) {
    const conversation = await prisma.conversation.create({
      data: {
        organizationId: organization.id,
        channel: "Shared inbox",
        contactName: name,
        contactEmail: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
        contactPhone: `+91 98${i}00 12${i}45`,
        subject: "Bali itinerary enquiry",
        status: "Open",
        assignedTo: EMPLOYEE_SEED[i % EMPLOYEE_SEED.length]!.name,
        lastMessageAt: new Date(),
      },
    });
    await prisma.message.createMany({
      data: [
        { conversationId: conversation.id, direction: "in", channel: "Shared inbox", body: MESSAGE_SEED[0]! },
        {
          conversationId: conversation.id,
          direction: "out",
          channel: "Shared inbox",
          body: MESSAGE_SEED[1]!,
          sentByName: "Sarah Wilson",
        },
        { conversationId: conversation.id, direction: "in", channel: "Shared inbox", body: MESSAGE_SEED[2]! },
      ],
    });
  }

  // Conversations that belong to the connected chains
  for (const chain of buildChainConversations()) {
    const conversation = await prisma.conversation.create({
      data: {
        organizationId: organization.id,
        channel: chain.channel,
        contactName: chain.contactName,
        contactEmail: chain.contactEmail,
        contactPhone: chain.contactPhone,
        subject: chain.subject,
        status: chain.status,
        assignedTo: chain.assignedTo,
        lastMessageAt: new Date(),
      },
    });
    await prisma.message.createMany({
      data: chain.messages.map((message) => ({
        conversationId: conversation.id,
        direction: message.direction,
        channel: chain.channel,
        body: message.body,
        sentByName: message.sentByName ?? chain.contactName,
      })),
    });
  }

  // Subscription + usage for the SaaS screens
  await prisma.subscription.create({
    data: {
      organizationId: organization.id,
      planKey: "enterprise",
      status: "active",
      billingCycle: "Yearly",
      seats: EMPLOYEE_SEED.length,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
    },
  });
  const period = new Date().toISOString().slice(0, 7);
  await prisma.usageRecord.createMany({
    data: [
      { organizationId: organization.id, metric: "seats", value: EMPLOYEE_SEED.length, period },
      { organizationId: organization.id, metric: "branches", value: BRANCH_SEED.length, period },
      { organizationId: organization.id, metric: "bookings", value: records.filter((r) => r.moduleId === "bookings").length, period },
    ],
  });

  // A starter API key for integrations / agent portals
  const rawKey = `tdk_${randomBytes(24).toString("hex")}`;
  await prisma.apiKey.create({
    data: {
      organizationId: organization.id,
      name: "Default API key",
      prefix: rawKey.slice(0, 12),
      keyHash: sha256(rawKey),
      scopes: stringifyJson(["*"]),
    },
  });

  console.log("✓ Seed complete");
  console.log(`  Organisation : ${ORG_SEED.name} (${organization.id})`);
  console.log(`  Modules      : ${MODULES.length} catalogued, ${RECORD_MODULES.length} with records`);
  console.log(`  Records      : ${records.length}`);
  console.log(`  Login        : ${env.SEED_OWNER_EMAIL} / ${env.SEED_OWNER_PASSWORD}`);
  console.log(`  API key      : ${rawKey}  (store it now — shown only once)`);
}

if (require.main === module) {
  const reset = process.argv.includes("--reset") || process.env.SEED_RESET === "true";
  seed({ reset })
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch(async (error) => {
      console.error("✖ Seed failed:", error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
