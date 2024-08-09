const {
  Application,
  Converter,
  Context,
  ReflectionKind,
  DeclarationReflection,
  RendererEvent,
  UrlMapping,
  Reflection,
} = require("typedoc");
const fs = require("fs");
const path = require("path");
const { glob } = require("glob");
const { Project, ClassDeclaration } = require("ts-morph");

const WHITELISTED_CHAT_MODEL_INHERITED_METHODS = [
  "invoke",
  "stream",
  "batch",
  "streamLog",
  "streamEvents",
  "bind",
  "bindTools",
  "asTool",
  "pipe",
  "withConfig",
  "withRetry",
  "assign",
  "getNumTokens",
  "getGraph",
  "pick",
  "withFallbacks",
  "withStructuredOutput",
  "withListeners",
  "transform",
];

const REFLECTION_KINDS_TO_HIDE = [
  ReflectionKind.Property,
  ReflectionKind.Accessor,
  ReflectionKind.Variable,
  ReflectionKind.Method,
  ReflectionKind.Function,
  ReflectionKind.Class,
  ReflectionKind.Interface,
  ReflectionKind.Enum,
  ReflectionKind.TypeAlias,
];

const BASE_OUTPUT_DIR = "./public";
const SCRIPT_HTML = `<script>
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.keyCode === 75) { // Check for CMD + K or CTRL + K
      const input = document.getElementById('tsd-search-field'); // Get the search input element by ID
      input.focus(); // Focus on the search input element
      document.getElementById('tsd-search').style.display = 'block'; // Show the div wrapper with ID tsd-search
    }
  }, false); // Add event listener for keydown events
</script>`;
const VERSION_DROPDOWN_HTML = `<div class="version-select">
<select id="version-dropdown" onchange="window.location.href=this.value;">
  <option selected value="">v0.2</option>
  <option value="https://v01.api.js.langchain.com/">v0.1</option>
</select>
</div>`;

/**
 *
 * @param {unknown} children
 */
function recursiveChildrenUrlEditor(children) {
  if (typeof children === "object") {
    if (
      "url" in children &&
      typeof children.url === "string" &&
      children.url.includes("/_langchain")
    ) {
      children.url = children.url.replace("/_langchain", "/langchain");
    }
    if ("children" in children && Array.isArray(children.children)) {
      children.children.forEach((child) => {
        recursiveChildrenUrlEditor(child);
      });
    }
    if ("groups" in children && Array.isArray(children.groups)) {
      children.groups.forEach((group) => {
        if ("children" in group && Array.isArray(group.children)) {
          group.children.forEach((child) => {
            recursiveChildrenUrlEditor(child);
          });
        }
      });
    }
  }
}

/**
 *
 * @param {UrlMapping<Reflection>} urlMap
 */
function updateUrlMappings(urlMap) {
  if (urlMap.url.includes("/_langchain")) {
    urlMap.url = urlMap.url.replace("/_langchain", "/langchain");
  }
  if (urlMap.model.url?.includes("/_langchain")) {
    urlMap.model.url = urlMap.model.url.replace("/_langchain", "/langchain");
  }

  if (urlMap.model.children?.length) {
    urlMap.model.children.forEach((child) => {
      if (child && child.url?.includes("/_langchain")) {
        child.url = child.url.replace("/_langchain", "/langchain");
      }
    });
  }
  if (urlMap.model.groups?.length) {
    urlMap.model.groups.forEach((group) => {
      if (group && group.children?.length) {
        group.children.forEach((child) => {
          recursiveChildrenUrlEditor(child);
        });
      }
    });
  }
}

/**
 * @param {string | undefined} deprecationText
 * @returns {string}
 */
const DEPRECATION_HTML = (deprecationText) => `<div class="deprecation-warning">
<h2>⚠️ Deprecated ⚠️</h2>
${deprecationText ? `<p>${deprecationText}</p>` : ""}
<p>This feature is deprecated and will be removed in the future.</p>
<p>It is not recommended for use.</p>
</div>`;

/**
 * @param {ClassDeclaration} classDeclaration
 * @returns {boolean}
 */
function isBaseChatModelOrSimpleChatModel(classDeclaration) {
  let currentClass = classDeclaration;
  while (currentClass) {
    const baseClassName = currentClass.getBaseClass()?.getName();
    if (
      baseClassName === "BaseChatModel" ||
      baseClassName === "SimpleChatModel"
    ) {
      return true;
    }
    currentClass = currentClass.getBaseClass();
  }
  return false;
}

function getAllChatModelNames() {
  const communityChatModelPath =
    "../../libs/langchain-community/src/chat_models/*";
  const communityChatModelNestedPath =
    "../../libs/langchain-community/src/chat_models/**/*";
  const partnerPackageGlob =
    "../../libs/!(langchain-community)/**/chat_models.ts";
  const partnerPackageFiles = glob.globSync(partnerPackageGlob);

  const tsMorphProject = new Project();
  const sourceFiles = tsMorphProject.addSourceFilesAtPaths([
    communityChatModelPath,
    communityChatModelNestedPath,
    ...partnerPackageFiles,
  ]);

  const chatModelNames = [];
  for (const sourceFile of sourceFiles) {
    const exportedClasses = sourceFile.getClasses();
    for (const exportedClass of exportedClasses) {
      if (isBaseChatModelOrSimpleChatModel(exportedClass)) {
        chatModelNames.push(exportedClass.getName());
      }
    }
  }
  return chatModelNames.flatMap((n) => (n ? [n] : []));
}

/**
 * @param {DeclarationReflection} reflection
 * @param {Array<string>} chatModelNames
 */
function shouldRemoveReflection(reflection, chatModelNames) {
  const kind = reflection.kind;

  if (
    reflection.parent &&
    chatModelNames.find((name) => name === reflection.parent.name) &&
    reflection.name !== "constructor"
  ) {
    if (kind === ReflectionKind.Property) {
      return true;
    }
    if (
      !WHITELISTED_CHAT_MODEL_INHERITED_METHODS.find(
        (n) => n === reflection.name
      )
    ) {
      return true;
    }
    if (kind === ReflectionKind.Accessor && reflection.name === "callKeys") {
      return true;
    }
  }

  if (REFLECTION_KINDS_TO_HIDE.find((kindToHide) => kindToHide === kind)) {
    if (reflection.name.startsWith("_") || reflection.name.startsWith("lc_")) {
      // Remove all reflections which start with an `_` or `lc_`
      return true;
    }
  }
}

/**
 * @param {Application} application
 * @returns {void}
 */
function load(application) {
  let allChatModelNames = [];
  try {
    allChatModelNames = getAllChatModelNames();
  } catch (err) {
    console.error("Error while getting all chat model names");
    throw err;
  }

  application.converter.on(
    Converter.EVENT_CREATE_DECLARATION,
    resolveReflection
  );

  application.renderer.on(RendererEvent.END, onEndRenderEvent);

  application.renderer.on(RendererEvent.BEGIN, onBeginRendererEvent);

  /**
   * @param {Context} _context
   * @param {DeclarationReflection} reflection
   * @returns {void}
   */
  function resolveReflection(context, reflection) {
    const { project } = context;

    if (shouldRemoveReflection(reflection, allChatModelNames)) {
      project.removeReflection(reflection);
    }
  }

  /**
   *
   * @param {RendererEvent} event
   */
  function onBeginRendererEvent(event) {
    event.urls.forEach((urlMap) => updateUrlMappings(urlMap));
  }

  /**
   * @param {Context} context
   */
  function onEndRenderEvent(context) {
    const htmlToSplitAtSearchScript = `<div class="tsd-toolbar-contents container">`;
    const htmlToSplitAtVersionDropdown = `<div id="tsd-toolbar-links">`;
    const deprecatedHTML = "<h4>Deprecated</h4>";

    const { urls } = context;
    for (const { url } of urls) {
      const indexFilePath = path.join(BASE_OUTPUT_DIR, url);
      let htmlFileContent = fs.readFileSync(indexFilePath, "utf-8");

      if (htmlFileContent.includes(deprecatedHTML)) {
        // If any comments are added to the `@deprecated` JSDoc, they'll
        // be inside the following <p> tag.
        const deprecationTextRegex = new RegExp(
          `${deprecatedHTML}<p>(.*?)</p>`
        );
        const deprecationTextMatch =
          htmlFileContent.match(deprecationTextRegex);

        /** @type {string | undefined} */
        let textInsidePTag;

        if (deprecationTextMatch) {
          textInsidePTag = deprecationTextMatch[1];
          const newTextToReplace = `${deprecatedHTML}<p>${textInsidePTag}</p>`;
          htmlFileContent = htmlFileContent.replace(
            newTextToReplace,
            DEPRECATION_HTML(textInsidePTag)
          );
        } else {
          htmlFileContent = htmlFileContent.replace(
            deprecatedHTML,
            DEPRECATION_HTML(undefined)
          );
        }
      }

      const [part1, part2] = htmlFileContent.split(htmlToSplitAtSearchScript);
      const htmlWithScript = part1 + SCRIPT_HTML + part2;
      const htmlWithDropdown = htmlWithScript.replace(
        htmlToSplitAtVersionDropdown,
        htmlToSplitAtVersionDropdown + VERSION_DROPDOWN_HTML
      );
      fs.writeFileSync(indexFilePath, htmlWithDropdown);
    }
  }
}

module.exports = { load };
