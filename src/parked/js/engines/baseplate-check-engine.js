(function (global) {
  "use strict";
  // Orchestrator: runs every base-plate check on a fully-defined design and
  // returns utilisations + pass/fail.  Delegates the mechanics to the small
  // engines (bolt / leff / tstub / stiffener / shear).
  // inp (mm/N/MPa): fy,gM0,B,tp,edge,pitch,nRow,nCol,w,m,e,npry,alpha,hUp,tw,
  //                 FtRd_N,FvRd_N,M_Ed (N·mm), V_Ed (N)
  const windpost = global.Windpost = global.Windpost || {};

  function run(inp) {
    const Bolt = windpost.baseplateBolt, Le = windpost.baseplateLeff, Ts = windpost.baseplateTStub,
          St = windpost.baseplateStiffener, Sh = windpost.baseplateShear;

    const arms = Bolt.armsList(inp.edge, inp.pitch, inp.nRow);
    const sumArms = Bolt.sum(arms);
    const nbolts = inp.nRow * inp.nCol;

    const Mr = Bolt.groupMr(arms, inp.nCol, inp.FtRd_N);
    const FtEd = Bolt.tension(inp.M_Ed, arms, inp.nCol);
    const L = Le.governing({ m: inp.m, mx: inp.m, e: inp.e, ex: inp.e, w: inp.w,
                             pitch: inp.pitch, bp: inp.B, alpha: inp.alpha });
    const Mlocal = FtEd * inp.m;
    const ts = Ts.modes(L.gov, inp.tp, inp.fy, inp.gM0, inp.m, inp.npry, inp.FtRd_N, Mlocal);
    const st = St.teeZ(inp.B, inp.tp, inp.hUp, inp.tw);
    const stMr = st.Z * inp.fy / inp.gM0;
    const sh = Sh.plate(inp.B, inp.tp, inp.fy, inp.gM0);
    const shBolt = nbolts * inp.FvRd_N;

    const util = {
      boltGroup:  inp.M_Ed / Mr,
      plateLocal: Mlocal / ts.Mpl,
      rigid:      ts.treq / inp.tp,
      tstub:      FtEd / ts.gov,
      stiffener:  inp.M_Ed / stMr,
      shearBolt:  inp.V_Ed / shBolt,
      shearPlate: inp.V_Ed / sh.Vpl
    };
    const govUtil = Math.max(util.boltGroup, util.plateLocal, util.tstub,
                             util.stiffener, util.shearBolt, util.shearPlate);
    return {
      arms, sumArms, nbolts, Mr, FtEd, Leff: L.gov, leffPatterns: L.patterns,
      Mlocal, Mpl: ts.Mpl, treqRigid: ts.treq, isRigid: ts.treq <= inp.tp,
      mode1: ts.mode1, mode2: ts.mode2, mode3: ts.mode3, tstubGov: ts.gov,
      stiffZ: st.Z, stiffMr: stMr, Vpl: sh.Vpl, Av: sh.Av, shBolt,
      util, govUtil, pass: govUtil <= 1.0
    };
  }

  windpost.baseplateCheck = Object.freeze({ run });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplateCheck;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
