import * as sharedSkills from "/mod/_core/skillset/skills.js";

const ADMIN_TOP_LEVEL_SKILL_FILE_PATTERN = sharedSkills.TOP_LEVEL_SKILL_FILE_PATTERN;
const ADMIN_ALL_SKILL_FILE_PATTERN = sharedSkills.ALL_SKILL_FILE_PATTERN;
const ADMIN_MAX_LAYER = 0;

export async function loadAdminSkillCatalog() {
  return sharedSkills.loadSkillIndex({
    maxLayer: ADMIN_MAX_LAYER,
    pattern: ADMIN_TOP_LEVEL_SKILL_FILE_PATTERN
  });
}

export async function buildAdminSkillsPromptSection() {
  const index = await loadAdminSkillCatalog();
  return sharedSkills.buildSkillCatalogPromptSection(index, {
    loadCommand: 'await space.admin.loadSkill("id")'
  });
}

export async function buildAdminAutoLoadedSkillsPromptSection() {
  const index = await sharedSkills.loadSkillIndex({
    maxLayer: ADMIN_MAX_LAYER,
    pattern: ADMIN_ALL_SKILL_FILE_PATTERN
  });
  return sharedSkills.buildAutoLoadedSkillsPromptSection(index);
}

export async function buildAdminSkillPromptContext(options = {}) {
  const includeCatalog = options.includeCatalog !== false;
  const includeAutoLoaded = options.includeAutoLoaded !== false;
  const includeRuntimeLoaded = options.includeRuntimeLoaded !== false;
  const catalogIndex = includeCatalog
    ? await sharedSkills.loadSkillIndex({
        maxLayer: ADMIN_MAX_LAYER,
        pattern: ADMIN_TOP_LEVEL_SKILL_FILE_PATTERN
      })
    : null;
  const autoLoadedIndex = includeAutoLoaded
    ? await sharedSkills.loadSkillIndex({
        maxLayer: ADMIN_MAX_LAYER,
        pattern: ADMIN_ALL_SKILL_FILE_PATTERN
      })
    : null;

  return {
    catalogSection: includeCatalog
      ? sharedSkills.buildSkillCatalogPromptSection(catalogIndex, {
          loadCommand: 'await space.admin.loadSkill("id")'
        })
      : "",
    autoLoadedHistoryMessages: includeAutoLoaded
      ? sharedSkills.buildAutoLoadedSkillsHistoryMessages(autoLoadedIndex)
      : [],
    autoLoadedSkillsSection: includeAutoLoaded
      ? sharedSkills.buildAutoLoadedSkillsPromptSection(autoLoadedIndex)
      : "",
    autoLoadedTransientSections: includeAutoLoaded
      ? sharedSkills.buildAutoLoadedSkillsTransientSections(autoLoadedIndex, {
          headingPrefix: "Skill",
          keyPrefix: "skill:auto",
          orderBase: -200
        })
      : [],
    loadedSkillsSection: includeRuntimeLoaded
      ? sharedSkills.buildRuntimeLoadedSkillsPromptSection({
          heading: "loaded skills"
        })
      : "",
    loadedTransientSections: includeRuntimeLoaded
      ? sharedSkills.buildRuntimeLoadedSkillsTransientSections({
          headingPrefix: "Loaded Skill",
          keyPrefix: "skill:loaded",
          orderBase: -100
        })
      : []
  };
}

export async function loadAdminSkill(name) {
  const loadedSkill = {
    __spaceAdminSkill: true,
    ...(await sharedSkills.loadSkill({
      maxLayer: ADMIN_MAX_LAYER,
      path: name
    })),
    skillName: sharedSkills.normalizeSkillPath(name)
  };
  loadedSkill.loadResponseText = sharedSkills.getSkillLoadResponseText(loadedSkill);
  sharedSkills.registerLoadedSkill(loadedSkill);
  return loadedSkill;
}

export function installAdminSkillRuntime() {
  globalThis.space.admin = {
    ...(globalThis.space.admin && typeof globalThis.space.admin === "object" ? globalThis.space.admin : {}),
    loadSkill: loadAdminSkill
  };
}
