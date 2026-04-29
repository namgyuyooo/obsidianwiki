

// Notion Wiki Browser Functions
function initializeNotionWikiBrowser() {
  const firstSection = document.querySelector(".notion-nav-content");
  if (firstSection) {
    firstSection.classList.add("notion-expanded");
    const firstChevron = document.querySelector(".notion-chevron");
    if (firstChevron) firstChevron.textContent = "▲";
  }
  loadNotionWikiBrowser();
}

async function loadNotionWikiBrowser() {
  try {
    const payload = await api("/api/wiki/index");
    if (payload.pages) {
      categorizeWikiPages(payload.pages);
      updateNotionStats();
      renderNotionWikiContent();
    }
  } catch (error) {
    console.error("Failed to load wiki browser:", error);
    useMockWikiData();
  }
}

function useMockWikiData() {
  const mockPages = [
    { title: "Schema", path: "obsidian/Wiki/Schema.md", frontmatter: { type: "schema", updated: "2026-04-29" } },
    { title: "Wiki Log", path: "obsidian/Wiki/log.md", frontmatter: { type: "log", updated: "2026-04-29" } },
    { title: "Wiki Index", path: "obsidian/Wiki/index.md", frontmatter: { type: "index", updated: "2026-04-29" } },
    { title: "Common Hub", path: "obsidian/Wiki/Common/hub.md", frontmatter: { type: "hub", updated: "2026-04-29" } },
    { title: "Search Evidence Deletion Registry", path: "obsidian/Wiki/Common/Search_Evidence_Deletion_Registry.md", frontmatter: { type: "knowledge", updated: "2026-04-29" } },
    { title: "PSK Project Hub", path: "obsidian/Wiki/PSK_Project/hub.md", frontmatter: { type: "hub", updated: "2026-04-21" } },
  ];
  
  categorizeWikiPages(mockPages);
  updateNotionStats();
  renderNotionWikiContent();
}
