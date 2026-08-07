(function initialiseSectionProfileEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const { CM4_TO_MM4, CM3_TO_MM3 } = windpost.config;
  const standardHeights_mm = windpost.standardSectionHeights;

  const toCatalogueSection = (section) => Object.freeze({
    ...section,
    supportCondition: "all",
    availableLengths: standardHeights_mm
  });

  // The DU catalogue is optional — a page that does not load it still runs.
  const duSections = (windpost.duSectionDatabase &&
    windpost.duSectionDatabase.sections) || [];

  const allSections = Object.freeze([
    ...windpost.uSectionDatabase.sections.map(toCatalogueSection),
    ...windpost.lSectionDatabase.sections.map(toCatalogueSection),
    ...duSections.map(toCatalogueSection)
  ]);

  const getLookupSupportCondition = (supportCondition) =>
    supportCondition === "proppedCantilever" ? "cantilever" : supportCondition;

  const getSections = (type, supportCondition) => {
    const lookupCondition = getLookupSupportCondition(supportCondition);
    return allSections.filter((section) =>
      section.type === type && (
        section.supportCondition === "all" ||
        section.supportCondition === lookupCondition
      )
    );
  };

  const getAvailableLengths = (section) =>
    section && Array.isArray(section.availableLengths) ? [...section.availableLengths] : [];

  const getSectionProperties = (section) => ({
    ixx_mm4: Number.isFinite(section.ixx_mm4)
      ? section.ixx_mm4
      : section.ixx_cm4 * CM4_TO_MM4,
    zxx_mm3: Number.isFinite(section.zxx_mm3)
      ? section.zxx_mm3
      : section.zxx_cm3 * CM3_TO_MM3,
    crossSectionalArea_mm2: section.crossSectionalArea_mm2
  });

  windpost.sectionProfileEngine = Object.freeze({
    allSections,
    standardHeights_mm,
    getLookupSupportCondition,
    getSections,
    getAvailableLengths,
    getSectionProperties
  });
})(window);
