(function initialiseSectionProfileEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const { CM4_TO_MM4, CM3_TO_MM3 } = windpost.config;
  const standardHeights_mm = windpost.standardSectionHeights;

  const toCatalogueSection = (supportCondition) => (section) => Object.freeze({
    ...section,
    supportCondition,
    availableLengths: standardHeights_mm
  });

  // U and L posts may be simply supported or cantilever. DU (double U) and
  // I (flat plate in the inner leaf) posts are simply supported only.
  const optional = (database) => (database && Array.isArray(database.sections)) ? database.sections : [];
  const allSections = Object.freeze([
    ...windpost.uSectionDatabase.sections.map(toCatalogueSection("all")),
    ...windpost.lSectionDatabase.sections.map(toCatalogueSection("all")),
    ...optional(windpost.duSectionDatabase).map(toCatalogueSection("simplySupported")),
    ...optional(windpost.iSectionDatabase).map(toCatalogueSection("simplySupported"))
  ]);

  const FAMILIES = Object.freeze({
    U: Object.freeze({ code: "U", label: "U-shaped post", cantilever: true, innerTie: "U tie" }),
    L: Object.freeze({ code: "L", label: "L-shaped post", cantilever: true, innerTie: "Shear tie" }),
    DU: Object.freeze({ code: "DU", label: "Double-U post", cantilever: false, innerTie: "U tie" }),
    I: Object.freeze({ code: "I", label: "I (flat plate) post", cantilever: false, innerTie: "Shear tie" })
  });
  const supportsCantilever = (type) => Boolean(FAMILIES[type] && FAMILIES[type].cantilever);

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
    FAMILIES,
    supportsCantilever,
    standardHeights_mm,
    getLookupSupportCondition,
    getSections,
    getAvailableLengths,
    getSectionProperties
  });
})(window);
