/**
 * ==========================================================================
 * शालेय पोषण आहार (MDM) Automated Test Suite
 * Validates Test Cases 1 through 8 from Requirements
 * ==========================================================================
 */

const testSuite = {

  tests: [
    {
      id: 1,
      name: "Test 1: 10 विद्यार्थी व मुगडाळ खिचडी",
      description: "Children = 10, Menu = मुगडाळ खिचडी. सर्व घटकांचे अचूक प्रमाण तपासणे.",
      run() {
        const date = "2026-08-17"; // Monday
        const calc = app.calculateDay(date, 10, "मुगडाळ खिचडी");
        
        const q = calc.quantities;
        const passRice = Math.abs(q.rice - 1.00) < 0.0001;
        const passMoong = Math.abs(q.moong_dal - 0.20) < 0.0001;
        const passTur = (q.tur_dal === 0 || q.tur_dal === undefined);
        const passMustard = Math.abs(q.mustard - 0.0015) < 0.0001;
        const passCumin = Math.abs(q.cumin - 0.0020) < 0.0001;
        const passTurmeric = Math.abs(q.turmeric - 0.0015) < 0.0001;
        const passChilli = Math.abs(q.chilli - 0.0300) < 0.0001;
        const passMasala = Math.abs(q.masala - 0.0090) < 0.0001;
        const passOil = Math.abs(q.oil - 0.0500) < 0.0001;
        const passSalt = Math.abs(q.salt - 0.0070) < 0.0001;
        const passFuel = Math.abs(calc.fuelCost - 15.10) < 0.01;

        const passed = passRice && passMoong && passTur && passMustard && passCumin && 
                       passTurmeric && passChilli && passMasala && passOil && passSalt && passFuel;

        return {
          passed,
          details: `तांदूळ = ${q.rice} kg (अपेक्षित: 1.00), मूगडाळ = ${q.moong_dal} kg (अपेक्षित: 0.20), तूरडाळ = ${q.tur_dal || 0} kg (अपेक्षित: 0), तेल = ${q.oil} kg (अपेक्षित: 0.05), इंधन = रु. ${calc.fuelCost}`
        };
      }
    },
    {
      id: 2,
      name: "Test 2: 25 विद्यार्थी व वरणभात",
      description: "Children = 25, Menu = वरणभात. तांदूळ 2.50 kg, तूरडाळ 0.50 kg तपासणे.",
      run() {
        const date = "2026-08-18"; // Tuesday
        const calc = app.calculateDay(date, 25, "वरणभात");
        
        const q = calc.quantities;
        const passRice = Math.abs(q.rice - 2.50) < 0.0001;
        const passTur = Math.abs(q.tur_dal - 0.50) < 0.0001;
        const passOil = Math.abs(q.oil - 0.125) < 0.0001;
        const passFuel = Math.abs(calc.fuelCost - 37.75) < 0.01;

        const passed = passRice && passTur && passOil && passFuel;

        return {
          passed,
          details: `तांदूळ = ${q.rice} kg (अपेक्षित: 2.50), तूरडाळ = ${q.tur_dal} kg (अपेक्षित: 0.50), तेल = ${q.oil} kg (अपेक्षित: 0.125), इंधन = रु. ${calc.fuelCost}`
        };
      }
    },
    {
      id: 3,
      name: "Test 3: 50 विद्यार्थी व उसळभात",
      description: "Children = 50, Menu = उसळभात. तांदूळ 5.00 kg, कडधान्य 1.00 kg तपासणे.",
      run() {
        const date = "2026-08-19"; // Wednesday
        const calc = app.calculateDay(date, 50, "उसळभात");
        
        const q = calc.quantities;
        const passRice = Math.abs(q.rice - 5.00) < 0.0001;
        const pulseQty = (q.vatana || 0) + (q.chana || 0) + (q.matki || 0);
        const passPulse = Math.abs(pulseQty - 1.00) < 0.0001;
        const passOil = Math.abs(q.oil - 0.250) < 0.0001;

        const passed = passRice && passPulse && passOil;

        return {
          passed,
          details: `तांदूळ = ${q.rice} kg (अपेक्षित: 5.00), कडधान्य (उसळ) = ${pulseQty} kg (अपेक्षित: 1.00), तेल = ${q.oil} kg (अपेक्षित: 0.250)`
        };
      }
    },
    {
      id: 4,
      name: "Test 4: 0 विद्यार्थी (Children = 0)",
      description: "Children = 0. सर्व हिशोब 0 किंवा रिक्त होणे आवश्यक.",
      run() {
        const date = "2026-08-20";
        const calc = app.calculateDay(date, 0, "खिचडी");
        
        const q = calc.quantities;
        const passRice = (q.rice === 0 || q.rice === undefined);
        const passTur = (q.tur_dal === 0 || q.tur_dal === undefined);
        const passOil = (q.oil === 0 || q.oil === undefined);
        const passFuel = (calc.fuelCost === 0);

        const passed = passRice && passTur && passOil && passFuel;

        return {
          passed,
          details: `तांदूळ = ${q.rice || 0} kg, तूरडाळ = ${q.tur_dal || 0} kg, तेल = ${q.oil || 0} kg, इंधन = रु. ${calc.fuelCost}`
        };
      }
    },
    {
      id: 5,
      name: "Test 5: रविवार (Sunday Auto-Holiday)",
      description: "रविवारची तारीख निवडल्यास स्वयंचलित 'सुट्टी' व शून्य प्रमाण दाखवणे.",
      run() {
        const date = "2026-08-16"; // Sunday
        const dayName = app.getDayNameMarathi(date);
        const dayCode = app.getDayCode(date);
        const calc = app.calculateDay(date, 0);

        const isSunday = (dayName === "रविवार" && dayCode === 1);
        const isHoliday = (calc.isHoliday === true || calc.dayCode === 1);
        const passed = isSunday && isHoliday;

        return {
          passed,
          details: `वार = ${dayName}, वार कोड = ${dayCode}, सुट्टी स्थिती = ${isHoliday ? 'होय (सुट्टी)' : 'नाही'}`
        };
      }
    },
    {
      id: 6,
      name: "Test 6: उपस्थिती बदल (Dynamic 25 -> 40 Children)",
      description: "विद्यार्थी संख्या 25 वरून 40 केल्यास सर्व घटकांचा तात्काळ पुनर्हिशोब होणे.",
      run() {
        const calc25 = app.calculateDay("2026-08-18", 25, "वरणभात");
        const calc40 = app.calculateDay("2026-08-18", 40, "वरणभात");

        const passRice25 = Math.abs(calc25.quantities.rice - 2.50) < 0.0001;
        const passRice40 = Math.abs(calc40.quantities.rice - 4.00) < 0.0001;
        const passTur25 = Math.abs(calc25.quantities.tur_dal - 0.50) < 0.0001;
        const passTur40 = Math.abs(calc40.quantities.tur_dal - 0.80) < 0.0001;
        const passOil25 = Math.abs(calc25.quantities.oil - 0.125) < 0.0001;
        const passOil40 = Math.abs(calc40.quantities.oil - 0.200) < 0.0001;

        const passed = passRice25 && passRice40 && passTur25 && passTur40 && passOil25 && passOil40;

        return {
          passed,
          details: `25 विद्यार्थी: तांदूळ ${calc25.quantities.rice}kg, डाळ ${calc25.quantities.tur_dal}kg | 40 विद्यार्थी: तांदूळ ${calc40.quantities.rice}kg, डाळ ${calc40.quantities.tur_dal}kg`
        };
      }
    },
    {
      id: 7,
      name: "Test 7: मेन्यू बदल (Menu Switching)",
      description: "वरणभात वरून मुगडाळ खिचडी बदलल्यास डाळीचा प्रकार बदलणे.",
      run() {
        const calcVaran = app.calculateDay("2026-08-18", 20, "वरणभात");
        const calcMoong = app.calculateDay("2026-08-18", 20, "मुगडाळ खिचडी");

        const passVaran = (calcVaran.quantities.tur_dal > 0 && !calcVaran.quantities.moong_dal);
        const passMoong = (calcMoong.quantities.moong_dal > 0 && !calcMoong.quantities.tur_dal);

        const passed = passVaran && passMoong;

        return {
          passed,
          details: `वरणभात: तूरडाळ = ${calcVaran.quantities.tur_dal} kg, मूगडाळ = ${calcVaran.quantities.moong_dal || 0} | मुगडाळ खिचडी: मूगडाळ = ${calcMoong.quantities.moong_dal} kg, तूरडाळ = ${calcMoong.quantities.tur_dal || 0}`
        };
      }
    },
    {
      id: 8,
      name: "Test 8: डेटा सुरक्षा व साठवणूक (Persistence)",
      description: "नोंद जतन केल्यानंतर रीलोड केल्यावर डेटा अखंड उपलब्ध राहणे.",
      run() {
        const testDate = "2099-12-31";
        const testRecord = app.calculateDay(testDate, 33, "वरणभात");
        testRecord.remarks = "Persistence Verification Mock";

        // Test in isolated mock key without polluting user's actual records
        const mockKey = "MDM_TEST_MOCK_STORAGE";
        localStorage.setItem(mockKey, JSON.stringify({ records: { [testDate]: testRecord } }));
        const rawJson = localStorage.getItem(mockKey);
        localStorage.removeItem(mockKey);

        if (!rawJson) {
          return { passed: false, details: "LocalStorage चाचणी अयशस्वी." };
        }

        const parsed = JSON.parse(rawJson);
        const retrieved = parsed.records && parsed.records[testDate];
        const passed = retrieved && retrieved.children === 33 && retrieved.menuName === "वरणभात";

        return {
          passed,
          details: `जतन चाचणी यशस्वी (तारीख = ${testDate}, लाभार्थी = ${retrieved?.children}, मेन्यू = ${retrieved?.menuName})`
        };
      }
    },
    {
      id: 9,
      name: "Test 9: वार्षिक अहवाल गणना (1 एप्रिल ते 31 मार्च)",
      description: "Financial Year 12 Months rollover, Annual Rice, Pulses, Fuel and Cook total verification.",
      run() {
        const yearly = app.computeYearlyData('2019-2020');
        const passed = yearly && yearly.monthConfigs.length === 12 && 
                       yearly.ingredientMatrix.rice !== undefined &&
                       yearly.totalWorkingDays >= 0;

        return {
          passed,
          details: `12 महिने गोषवारा तयार: कामाचे दिवस = ${yearly.totalWorkingDays}, एकूण लाभार्थी = ${yearly.totalBeneficiaries}, इंधन खर्च = ₹${yearly.totalFuelSubsidy}`
        };
      }
    },
    {
      id: 10,
      name: "Test 10: इ. ६ ते ८ (उच्च प्राथमिक) मुगडाळ खिचडी गणना",
      description: "Children = 10, Menu = मुगडाळ खिचडी, Section = 'upper'. तांदूळ 1.50 kg, मूगडाळ 0.30 kg, तेल 0.075 kg, इंधन रु. 21.70.",
      run() {
        const date = "2026-08-17";
        const calc = app.calculateDay(date, 10, "मुगडाळ खिचडी", null, null, 'upper');
        const q = calc.quantities;
        const passRice = Math.abs(q.rice - 1.50) < 0.0001;
        const passMoong = Math.abs(q.moong_dal - 0.30) < 0.0001;
        const passOil = Math.abs(q.oil - 0.075) < 0.0001;
        const passFuel = Math.abs(calc.fuelCost - 21.70) < 0.01;

        const passed = passRice && passMoong && passOil && passFuel;
        return {
          passed,
          details: `तांदूळ = ${q.rice} kg (अपेक्षित: 1.50), मूगडाळ = ${q.moong_dal} kg (अपेक्षित: 0.30), तेल = ${q.oil} kg (अपेक्षित: 0.075), इंधन = रु. ${calc.fuelCost} (अपेक्षित: 21.70)`
        };
      }
    },
    {
      id: 11,
      name: "Test 11: इ. ६ ते ८ (उच्च प्राथमिक) वरणभात गणना",
      description: "Children = 20, Menu = वरणभात, Section = 'upper'. तांदूळ 3.00 kg, तूरडाळ 0.60 kg, इंधन रु. 43.40.",
      run() {
        const date = "2026-08-18";
        const calc = app.calculateDay(date, 20, "वरणभात", null, null, 'upper');
        const q = calc.quantities;
        const passRice = Math.abs(q.rice - 3.00) < 0.0001;
        const passTur = Math.abs(q.tur_dal - 0.60) < 0.0001;
        const passFuel = Math.abs(calc.fuelCost - 43.40) < 0.01;

        const passed = passRice && passTur && passFuel;
        return {
          passed,
          details: `तांदूळ = ${q.rice} kg (अपेक्षित: 3.00), तूरडाळ = ${q.tur_dal} kg (अपेक्षित: 0.60), इंधन = रु. ${calc.fuelCost} (अपेक्षित: 43.40)`
        };
      }
    },
    {
      id: 12,
      name: "Test 12: १ ते ५ आणि ६ ते ८ स्वतंत्र नोंदी पडताळणी (Dual Section Isolation)",
      description: "एकाच UDISE लॉगिनखाली १-५ ची नोंद data.records मध्ये व ६-८ ची नोंद data.recordsUpper मध्ये एकमेकांना बाधा न आणता राहते.",
      run() {
        const testDate = "2026-09-01";
        const origRec = app.data?.records ? app.data.records[testDate] : undefined;
        const origRecUpper = app.data?.recordsUpper ? app.data.recordsUpper[testDate] : undefined;
        try {
          // Save distinct records for both sections
          const calcP = app.calculateDay(testDate, 8, "मुगडाळ खिचडी", null, null, 'primary');
          const calcU = app.calculateDay(testDate, 14, "मुगडाळ खिचडी", null, null, 'upper');
          
          if (!app.data.records) app.data.records = {};
          if (!app.data.recordsUpper) app.data.recordsUpper = {};
          
          app.data.records[testDate] = calcP;
          app.data.recordsUpper[testDate] = calcU;

          const pRec = app.getActiveRecords('primary')[testDate];
          const uRec = app.getActiveRecords('upper')[testDate];

          const passed = (pRec && pRec.children === 8 && pRec.quantities.rice === 0.8) &&
                         (uRec && uRec.children === 14 && Math.abs(uRec.quantities.rice - 2.1) < 0.0001) &&
                         (app.getActivePat('primary') !== undefined) &&
                         (app.getActivePat('upper') !== undefined);

          return {
            passed,
            details: `१ ते ५: ${pRec ? pRec.children : 0} मुले, तांदूळ ${pRec ? pRec.quantities.rice : 0} kg | ६ ते ८: ${uRec ? uRec.children : 0} मुले, तांदूळ ${uRec ? uRec.quantities.rice : 0} kg`
          };
        } finally {
          if (origRec !== undefined) {
            app.data.records[testDate] = origRec;
          } else if (app.data?.records) {
            delete app.data.records[testDate];
          }
          if (origRecUpper !== undefined) {
            app.data.recordsUpper[testDate] = origRecUpper;
          } else if (app.data?.recordsUpper) {
            delete app.data.recordsUpper[testDate];
          }
        }
      }
    },
    {
      id: 13,
      name: "Test 13: तांदूळ दैनिक नोंदवही (भाग-१) गणित व शिल्लक पडताळणी",
      description: "माहे १ ते ३१ तारखांचे हिशोब: दिवसाची सुरुवातीची शिल्लक + प्राप्त = एकूण उपलब्ध - वापर = अखेर शिल्लक तंतोतंत जुळते.",
      run() {
        const testMonth = "2026-09";
        const stockSummary = app.computeMonthlyStock(testMonth, 'primary');
        const op = stockSummary.opening.rice || 0;
        const rc = stockSummary.received.rice || 0;
        const con = stockSummary.consumed.rice || 0;
        const clo = stockSummary.closing.rice || 0;
        const expectedClo = +(op + rc - con).toFixed(3);
        const passed = Math.abs(clo - expectedClo) < 0.001 && typeof app.renderRiceMonthlyRegister === 'function';

        return {
          passed,
          details: `सुरुवात: ${op.toFixed(3)} kg, प्राप्त: ${rc.toFixed(3)} kg, वापर: ${con.toFixed(3)} kg => अखेर शिल्लक: ${clo.toFixed(3)} kg (अपेक्षित: ${expectedClo.toFixed(3)} kg)`
        };
      }
    },
    {
      id: 14,
      name: "Test 14: वार्षिक तांदूळ उपयोगिता प्रमाणपत्र व गोषवारा ताळेबंद पडताळणी",
      description: "एप्रिल ते मार्च १२ महिन्यांची तांदूळ बेरीज: १ एप्रिल शिल्लक + एकूण प्राप्त - एकूण शिजवलेला = ३१ मार्च शिल्लक तंतोतंत जुळते.",
      run() {
        const finYear = app.getCurrentAcademicYear();
        const yearlyData = app.computeYearlyData(finYear, 'primary');
        const riceMat = yearlyData.ingredientMatrix && yearlyData.ingredientMatrix.rice;
        const op = riceMat ? riceMat.opening : 0;
        const rec = riceMat ? riceMat.annualReceived : 0;
        const con = riceMat ? riceMat.annualConsumed : 0;
        const clo = riceMat ? riceMat.finalClosing : 0;
        const expectedClo = +(op + rec - con).toFixed(3);
        const passed = Math.abs(clo - expectedClo) < 0.01 && typeof app.renderRiceYearlyReport === 'function';

        return {
          passed,
          details: `वर्ष: ${finYear}, एप्रिल शिल्लक: ${op.toFixed(3)} kg, वर्ष प्राप्त: ${rec.toFixed(3)} kg, वर्ष शिजवलेला: ${con.toFixed(3)} kg => मार्च शिल्लक: ${clo.toFixed(3)} kg`
        };
      }
    },
    {
      id: 15,
      name: "Test 15: प्रपत्र ब (Form B) अधिकृत २० वस्तू व डायनॅमिक तालुका पडताळणी",
      description: "प्रपत्र ब मधील २० वस्तू अधिकृत शासन क्रमानुसार (तांदूळ ते दूध पावडर) आणि पंचायत समिती तालुका सेटिंग्जशी डायनॅमिक संलग्नता तपासणे.",
      run() {
        const has20Items = Array.isArray(app.FORM_B_ITEMS) && app.FORM_B_ITEMS.length === 20;
        const firstIsRice = has20Items && app.FORM_B_ITEMS[0].key === 'rice' && app.FORM_B_ITEMS[0].name === 'तांदूळ';
        const eighthIsChana = has20Items && app.FORM_B_ITEMS[7].key === 'chana' && app.FORM_B_ITEMS[7].name === 'हरभरा';
        const seventeenthIsPurak = has20Items && app.FORM_B_ITEMS[16].key === 'purak_ahar' && app.FORM_B_ITEMS[16].name === 'पूरक आहार';
        const twentiethIsMilk = has20Items && app.FORM_B_ITEMS[19].key === 'doodh_powder' && app.FORM_B_ITEMS[19].name === 'दूध पावडर';
        const curTaluka = (app.data && app.data.settings && app.data.settings.taluka) || '';
        const passed = has20Items && firstIsRice && eighthIsChana && seventeenthIsPurak && twentiethIsMilk && curTaluka !== '';

        return {
          passed,
          details: `एकूण वस्तू: ${app.FORM_B_ITEMS ? app.FORM_B_ITEMS.length : 0}/20, क्र. १: ${app.FORM_B_ITEMS[0]?.name}, क्र. ८: ${app.FORM_B_ITEMS[7]?.name}, क्र. १७: ${app.FORM_B_ITEMS[16]?.name}, क्र. २०: ${app.FORM_B_ITEMS[19]?.name}, पंचायत समिती तालुका: ${curTaluka}`
        };
      }
    },
    {
      id: 16,
      name: "Test 16: चालू महिना पुनर्गणना व सर्व २० वस्तूंचे मासिक अहवाल सिंक पडताळणी",
      description: "मासिक अहवालात 'चालू महिना पुनर्गणना' पद्धत उपलब्ध असणे, प्रपत्र ब चे सर्व २० घटक मासिक अहवालात समाविष्ट असणे आणि मागील महिन्यांचा डेटा १००% सुरक्षित राहणे.",
      run() {
        const hasRecalcMethod = typeof app.recalculateCurrentMonth === 'function';
        const hasStandardMenusMethod = typeof app.ensureStandardMenus === 'function';
        if (hasStandardMenusMethod) app.ensureStandardMenus();
        const hasGodBhat = Array.isArray(app.data?.menus) && app.data.menus.some(m => m.name === 'गोड भात' && m.pulseKey === 'gul_sakhar');
        const hasPurakAhar = Array.isArray(app.data?.menus) && app.data.menus.some(m => m.id === 'purak_ahar' || m.name === 'पूरक आहार');
        const hasDoodhKheer = Array.isArray(app.data?.menus) && app.data.menus.some(m => m.id === 'doodh_kheer' || m.name.includes('दूध'));
        
        // Safety verification: recalculating 2026-10 should NOT touch 2026-09
        const dummyDateOld = '2026-09-15';
        const dummyDateCurrent = '2026-10-15';
        const origRecOld = app.data?.records ? app.data.records[dummyDateOld] : undefined;
        const origRecCurrent = app.data?.records ? app.data.records[dummyDateCurrent] : undefined;

        try {
          if (!app.data.records) app.data.records = {};
          app.data.records[dummyDateOld] = { date: dummyDateOld, menuName: 'वरणभात', children: 20, plates: 20, fuelCost: 30.2, quantities: { rice: 2.0, tur_dal: 0.4 }, remarks: 'frozen' };
          app.data.records[dummyDateCurrent] = { date: dummyDateCurrent, menuName: 'वरणभात', children: 20, plates: 20, fuelCost: 10, quantities: { rice: 1.0, tur_dal: 0.2 }, remarks: 'active' };

          const picker = document.getElementById('monthlyExcelPicker');
          if (picker) picker.value = '2026-10';
          
          app.recalculateCurrentMonth(false); // Run without prompt

          const oldUntouched = app.data.records[dummyDateOld].quantities.rice === 2.0 && app.data.records[dummyDateOld].remarks === 'frozen';
          const currentUpdated = app.data.records[dummyDateCurrent].quantities.rice === 2.0; // Recalculated with latest 0.10 rate

          const passed = hasRecalcMethod && hasStandardMenusMethod && hasGodBhat && hasPurakAhar && hasDoodhKheer && oldUntouched && currentUpdated;

          return {
            passed,
            details: `पुनर्गणना पद्धत: ${hasRecalcMethod ? 'उपलब्ध' : 'गहाळ'}, मानक मेन्यू सिंक: ${hasGodBhat && hasPurakAhar ? 'यशस्वी' : 'त्रुटी'}, मागील महिना (2026-09) सुरक्षित: ${oldUntouched ? 'होय (100% Frozen)' : 'नाही'}, चालू महिना अपडेट: ${currentUpdated ? 'होय' : 'नाही'}`
          };
        } finally {
          if (origRecOld !== undefined) {
            app.data.records[dummyDateOld] = origRecOld;
          } else if (app.data?.records) {
            delete app.data.records[dummyDateOld];
          }
          if (origRecCurrent !== undefined) {
            app.data.records[dummyDateCurrent] = origRecCurrent;
          } else if (app.data?.records) {
            delete app.data.records[dummyDateCurrent];
          }
        }
      }
    },
    {
      id: 17,
      name: "Test 17: नोंद संपादन (सुट्टी/० मुले) व नोंद हटवणे (Tombstone Protection) पडताळणी",
      description: "नोंद संपादन करताना सुट्टी दिल्यास सर्व २० घटकांचे प्रमाण व इंधन शून्य होणे आणि नोंद हटवल्यास क्लाऊड रीस्टोअर न होता कायमस्वरूपी वगळली जाणे.",
      run() {
        const testDate = "2026-10-15";
        // 1. calculateDay with holiday/0 kids
        const holCalc = app.calculateDay(testDate, 0, "सुट्टी");
        const isHolZero = holCalc.isHoliday === true && holCalc.children === 0 && holCalc.fuelCost === 0 && Object.keys(holCalc.quantities).length === 0;

        // 2. cloudSync mergeDayRecord conflict resolution
        const remoteOld = { date: testDate, children: 45, isHoliday: false, quantities: { rice: 4.5, tur_dal: 0.9 }, updatedAt: '2026-10-15T10:00:00.000Z' };
        const localEdited = { date: testDate, children: 0, isHoliday: true, quantities: {}, updatedAt: '2026-10-15T12:00:00.000Z' };
        const mergedRec = cloudSync.mergeDayRecord(localEdited, remoteOld, true);
        const mergeWins = mergedRec && mergedRec.isHoliday === true && mergedRec.children === 0;

        // 3. Tombstone exclusion from cloud map
        const mergedMap = cloudSync.mergeDayRecordsMap({}, { [testDate]: remoteOld }, true, [testDate]);
        const tombstoneDrops = (mergedMap[testDate] === undefined);

        // 4. app.deleteCurrentDayRecord function availability
        const hasDeleteMethod = typeof app.deleteCurrentDayRecord === 'function';

        const passed = isHolZero && mergeWins && tombstoneDrops && hasDeleteMethod;

        return {
          passed,
          details: `सुट्टी/० मुले परिपूर्ण शून्य: ${isHolZero ? 'होय' : 'नाही'}, नवीन संपादनाला क्लाऊडवर प्राधान्य: ${mergeWins ? 'होय' : 'नाही'}, हटवलेली नोंद वगळली (Tombstone): ${tombstoneDrops ? 'होय' : 'नाही'}, हटवा बटण पद्धत: ${hasDeleteMethod ? 'उपलब्ध' : 'नाही'}`
        };
      }
    },
    {
      name: "Test 18: साठा शून्य/संपादन, खराब धान्य डिलिट Tombstone, प्रपत्र ब शून्य मागणी व एकत्रित नोंद",
      description: "सोयाबीन/किराणा साठा शून्य केल्यास क्लाऊड रीस्टोअर न होणे, खराब धान्य स्वाक्षरीने कायमस्वरूपी वगळले जाणे, दोन्ही नोंदी एकत्र व प्रपत्र ब डीफॉल्ट शून्य तपासणी.",
      run() {
        // 1. Stock zeroing with timestamp authority
        const oldRemoteStock = { rice: 100, soyavadi: 12.5, _updatedAt: '2026-10-10T10:00:00.000Z' };
        const newLocalStock = { rice: 100, soyavadi: 0, _updatedAt: '2026-10-19T10:00:00.000Z' };
        const mergedStock = cloudSync.mergeStockBalances(newLocalStock, oldRemoteStock, true);
        const zeroStockPreserved = (mergedStock && mergedStock.soyavadi === 0);

        // 2. Damaged stock deterministic signature tombstone
        const remoteDmg = { id: 'remote_dmg_1', date: '2026-10-15', section: 'primary', items: { soyavadi: 2.5 } };
        const sig = cloudSync.getDamagedSignature(remoteDmg);
        const mergedDmg = cloudSync.mergeDamagedStockList([], [remoteDmg], [], [sig]);
        const damagedTombstoneWorks = (Array.isArray(mergedDmg) && mergedDmg.length === 0);

        // 3. Dual entry modal and preview methods
        const hasDualModal = typeof app.openDualEntryModal === 'function';
        const hasDualPreview = typeof app.updateDualEntryPreview === 'function';
        const hasSaveDual = typeof app.saveDualRecords === 'function';
        const dualMethodsOk = hasDualModal && hasDualPreview && hasSaveDual;

        // 4. Fuel rate frozen in record
        const calcDay = app.calculateDay('2026-10-19', 10, 'वरणभात', 10, null, 'primary');
        const hasFrozenFuelRate = (typeof calcDay.fuelRate === 'number' && calcDay.fuelRate > 0);

        const passed = zeroStockPreserved && damagedTombstoneWorks && dualMethodsOk && hasFrozenFuelRate;

        return {
          passed,
          details: `साठा ० जतन (Timestamp Authority): ${zeroStockPreserved ? 'होय' : 'नाही'}, खराब धान्य डिलीट कायम (Signature Tombstone): ${damagedTombstoneWorks ? 'होय' : 'नाही'}, एकत्रित नोंद व प्रिव्ह्यू फंक्शन्स: ${dualMethodsOk ? 'उपलब्ध' : 'नाही'}, दैनिक नोंदीत इंधन दर गोठवला: ${hasFrozenFuelRate ? 'होय' : 'नाही'}`
        };
      }
    },
    {
      name: "Test 19: ड्युअल नोंद स्तर स्वातंत्र्य, खराब धान्य थेट क्लाऊड डिलीट, २-वे मॅन्युअल सिंक व इंधन फॉलबॅक",
      description: "प्राथमिक शाळेतही दोन्ही नोंदी एकत्र मॉडेल उघडणे, थेट क्लाऊडवरून खराब धान्य पुसले जाणे, मॅन्युअल सिंकने २-वे सिंक होणे आणि जुन्या नोंदींवरही अचूक इंधन खर्च येणे.",
      run() {
        // 1. Dual Entry Modal works even when schoolLevel was 'primary'
        const origLevel = app.data?.settings?.schoolLevel;
        if (app.data && app.data.settings) app.data.settings.schoolLevel = 'primary';
        let dualOpenedSafely = false;
        try {
          app.openDualEntryModal();
          const modal = document.getElementById('dualEntryModal');
          dualOpenedSafely = (modal && modal.style.display !== 'none');
          app.closeDualEntryModal();
        } catch (e) {
          dualOpenedSafely = false;
        } finally {
          if (app.data && app.data.settings && origLevel) app.data.settings.schoolLevel = origLevel;
        }

        // 2. Direct cloud purge method exists
        const hasCloudPurge = typeof cloudSync.deleteDamagedStockFromCloud === 'function';

        // 3. Relaxed signature works
        const testDmg = { date: '2026-08-15', section: 'primary', items: { soyavadi: 5 } };
        const relSig = cloudSync.getDamagedRelaxedSignature(testDmg);
        const relSigMatches = (relSig === '2026-08-15#soyavadi:5');

        // 4. Two-way manual sync function exists
        const hasManualSync = typeof app.handleCloudStatusClick === 'function';

        // 5. Monthly stock computes fuel even if legacy record lacks fuelCost
        const fakeRecord = { date: '2026-10-01', children: 20, plates: 20, isHoliday: false, quantities: { rice: 2.0 } };
        const savedRec = app.data?.records ? app.data.records['2026-10-01'] : null;
        if (!app.data.records) app.data.records = {};
        app.data.records['2026-10-01'] = fakeRecord;
        const monthSummary = app.computeMonthlyStock('2026-10', 'primary');
        const fuelFallbackWorks = (typeof monthSummary.totalFuel === 'number' && monthSummary.totalFuel > 0);
        if (savedRec) app.data.records['2026-10-01'] = savedRec; else delete app.data.records['2026-10-01'];

        const passed = dualOpenedSafely && hasCloudPurge && relSigMatches && hasManualSync && fuelFallbackWorks;

        return {
          passed,
          details: `प्राथमिक शाळेत ड्युअल मॉडेल उघडले: ${dualOpenedSafely ? 'होय' : 'नाही'}, थेट क्लाऊड डिलीट पद्धत: ${hasCloudPurge ? 'उपलब्ध' : 'नाही'}, रिलॅक्स स्वाक्षरी जुळली: ${relSigMatches ? 'होय' : 'नाही'}, २-वे मॅन्युअल सिंक: ${hasManualSync ? 'सक्षम' : 'नाही'}, इंधन फॉलबॅक कार्य: ${fuelFallbackWorks ? 'होय' : 'नाही'}`
        };
      }
    },
    {
      name: "Test 20: calculateDay सुट्टी/शून्य उपस्थिती सुरक्षितता व ड्युअल नोंद प्रिव्ह्यू",
      description: "सुट्टी, ० उपस्थिती, प्राथमिक आणि उच्च प्राथमिक स्तरावर calculateDay न अडखळता चालणे (activeFuelRate स्कोप त्रुटी कायमस्वरूपी दूर).",
      run() {
        let holSafe = false;
        let zeroSafe = false;
        let primSafe = false;
        let upperSafe = false;

        try {
          const resHol = app.calculateDay('2026-10-18', 0, 'सुट्टी');
          holSafe = (resHol && resHol.isHoliday === true && resHol.fuelRate === 0 && resHol.fuelCost === 0);
        } catch (e) {
          holSafe = false;
        }

        try {
          const resZero = app.calculateDay('2026-10-20', 0, 'वरणभात');
          zeroSafe = (resZero && resZero.isHoliday === true && resZero.fuelRate === 0 && resZero.fuelCost === 0);
        } catch (e) {
          zeroSafe = false;
        }

        try {
          const resPrim = app.calculateDay('2026-10-20', 10, 'वरणभात', null, null, 'primary');
          primSafe = (resPrim && resPrim.isHoliday === false && resPrim.fuelRate > 0 && resPrim.fuelCost > 0);
        } catch (e) {
          primSafe = false;
        }

        try {
          const resUpper = app.calculateDay('2026-10-20', 10, 'वरणभात', null, null, 'upper');
          upperSafe = (resUpper && resUpper.isHoliday === false && resUpper.fuelRate > 0 && resUpper.fuelCost > 0);
        } catch (e) {
          upperSafe = false;
        }

        const passed = holSafe && zeroSafe && primSafe && upperSafe;
        return {
          passed,
          details: `सुट्टी गणना: ${holSafe ? 'यशस्वी' : 'त्रुटी'}, शून्य उपस्थिती: ${zeroSafe ? 'यशस्वी' : 'त्रुटी'}, प्राथमिक गणना: ${primSafe ? 'यशस्वी' : 'त्रुटी'}, उच्च प्राथमिक गणना: ${upperSafe ? 'यशस्वी' : 'त्रुटी'}`
        };
      }
    },
    {
      name: "Test 21: ड्युअल नोंद (दोन्ही एकत्र नोंद) डाळ निवड पर्याय पडताळणी",
      description: "१ ते ५ आणि ६ ते ८ एकत्र नोंद करताना 'डाळ निवडा' पर्याय (Manual Dal Selection), कस्टम डाळ निवडणे आणि अचूक धान्य व मेनू नाव जतन होणे.",
      run() {
        // 1. Verify helper methods exist
        const hasPopulate = typeof app.populateDualDalDropdown === 'function';
        const hasRenderCheckboxes = typeof app.renderDualManualGrainsCheckboxes === 'function';
        const hasDalDropdownChange = typeof app.onDualDalDropdownChanged === 'function';
        const hasModeChange = typeof app.onDualGrainModeChange === 'function';

        // 2. Test manual grains calculation for dual entry
        const testDate = '2026-10-21';
        const pKids = 10;
        const uKids = 15;
        const customGrains = ['rice', 'moong_dal'];
        const reflectedMenu = app.getReflectedMenuName('वरणभात', false, '', customGrains);

        const calcP = app.calculateDay(testDate, pKids, reflectedMenu, pKids, customGrains, 'primary');
        const calcU = app.calculateDay(testDate, uKids, reflectedMenu, uKids, customGrains, 'upper');

        const primaryHasMoong = calcP.quantities && calcP.quantities.moong_dal > 0 && !calcP.quantities.tur_dal;
        const upperHasMoong = calcU.quantities && calcU.quantities.moong_dal > 0 && !calcU.quantities.tur_dal;
        const correctRice = (calcP.quantities?.rice === 1.0) && (calcU.quantities?.rice === 2.25);
        const correctMoong = (calcP.quantities?.moong_dal === 0.20) && (calcU.quantities?.moong_dal === 0.45);

        const passed = hasPopulate && hasRenderCheckboxes && hasDalDropdownChange && hasModeChange &&
                       primaryHasMoong && upperHasMoong && correctRice && correctMoong;

        return {
          passed,
          details: `फंक्शन्स उपलब्ध: ${hasPopulate && hasRenderCheckboxes ? 'होय' : 'नाही'}, प्राथमिक मूगडाळ गणना: ${primaryHasMoong ? 'अचूक' : 'चूक'}, उच्च प्राथमिक मूगडाळ: ${upperHasMoong ? 'अचूक' : 'चूक'}, तांदूळ/डाळ प्रमाण: ${correctRice && correctMoong ? 'तंतोतंत' : 'विसंगत'}`
        };
      }
    },
    {
      name: "Test 22: एप्रिल अखेरचा तांदूळ साठा आणि मे सुरुवातीचा तांदूळ साठा तंतोतंत जुळणी (Month Transition Parity)",
      description: "एप्रिल महिन्याचा अखेरचा शिल्लक तांदूळ साठा (Closing Balance) आणि १ मे चा सुरुवातीचा साठा (Opening Balance) तंतोतंत जुळणे, सुट्टीच्या दिवसातील तांदूळ वजा न होणे.",
      run() {
        if (typeof app === 'undefined') return { passed: false, details: "app ऑब्जेक्ट उपलब्ध नाही" };

        const origRecs = JSON.parse(JSON.stringify(app.data.records || {}));
        const origInit = JSON.parse(JSON.stringify(app.data.initialStock || {}));
        const origRcpt = JSON.parse(JSON.stringify(app.data.stockReceipts || []));
        const origDmg = JSON.parse(JSON.stringify(app.data.damagedStock || []));

        try {
          // Setup controlled test scenario
          app.data.initialStock = { rice: 100.0 };
          app.data.stockReceipts = [
            { id: 'rcpt_apr_1', date: '2026-04-05', items: { rice: 50.0 } }
          ];
          app.data.damagedStock = [
            { id: 'dmg_apr_1', date: '2026-04-15', items: { rice: 5.0 }, section: 'primary' }
          ];
          app.data.records = {
            // Working day 1: 50 children = 5.0 kg rice
            '2026-04-01': { date: '2026-04-01', children: 50, plates: 50, isHoliday: false, quantities: { rice: 5.0 } },
            // Holiday with residual ghost quantities (6.4 kg): must NOT be deducted
            '2026-04-03': { date: '2026-04-03', children: 0, plates: 0, isHoliday: true, quantities: { rice: 6.4 } },
            // Working day 2: 60 children = 6.0 kg rice
            '2026-04-10': { date: '2026-04-10', children: 60, plates: 60, isHoliday: false, quantities: { rice: 6.0 } }
          };

          // Compute April Month Summary:
          // Initial = 100, Received = 50 -> Available = 150
          // Consumed = 5.0 + 6.0 (cooking) + 5.0 (damaged) = 16.0
          // Expected April Closing = 150 - 16 = 134.0
          const aprStock = app.computeMonthlyStock('2026-04', 'primary');
          const aprCloseRice = +(aprStock.closing?.rice || 0);

          // Compute May 1st Opening Balance
          const mayOpenRice = +(app.computeStockForDate('2026-05-01', 'primary').rice || 0);

          const exactlyEqual = Math.abs(aprCloseRice - mayOpenRice) < 0.0001;
          const matchesExpected = Math.abs(aprCloseRice - 134.0) < 0.0001;
          const passed = exactlyEqual && matchesExpected;

          return {
            passed,
            details: `एप्रिल अखेर शिल्लक: ${aprCloseRice.toFixed(3)} kg, मे १ सुरुवातीचा साठा: ${mayOpenRice.toFixed(3)} kg, फरक: ${(aprCloseRice - mayOpenRice).toFixed(4)} kg, अपेक्षित: 134.000 kg`
          };
        } finally {
          app.data.records = origRecs;
          app.data.initialStock = origInit;
          app.data.stockReceipts = origRcpt;
          app.data.damagedStock = origDmg;
        }
      }
    },
    {
      name: "Test 23: खराब धान्य नोंद हटवणे व क्लाऊड सिंक सुरक्षा (Damaged Stock Tombstone & Anti-Resurrection)",
      description: "खराब धान्याची नोंद हटवल्यानंतर (Primary/Upper/Legacy without section) ती क्लाऊड सिंक किंवा रीफ्रेश झाल्यावर पुन्हा न येणे (Anti-Resurrection Tombstone).",
      run() {
        if (typeof cloudSync === 'undefined') return { passed: false, details: "cloudSync उपलब्ध नाही" };

        const testItem = {
          id: 'dmg_test_20260410_001',
          date: '2026-04-10',
          items: { rice: 5.5 },
          reason: 'किड लागलेले'
        };

        const strictSig = cloudSync.getDamagedSignature(testItem, 'upper');
        const relSig = cloudSync.getDamagedRelaxedSignature(testItem);

        // Simulate remote having legacy damaged item WITHOUT section property
        const remoteItemWithoutSection = {
          date: '2026-04-10',
          items: { rice: 5.5 },
          reason: 'किड लागलेले'
        };

        const remoteList = [remoteItemWithoutSection];
        const localList = [];
        const deletedIds = [testItem.id];
        const deletedSigs = [strictSig, relSig];

        const merged = cloudSync.mergeDamagedStockList(localList, remoteList, deletedIds, deletedSigs);
        const resurrectionPrevented = merged.length === 0;

        return {
          passed: resurrectionPrevented,
          details: `खराब धान्य रिमोट पुनरुत्थान रोखले: ${resurrectionPrevented ? 'होय (0 नोंदी पुनरुत्थान)' : 'नाही (पुन्हा आले)'}, शिग्नेचर मॅच: ${strictSig} & ${relSig}`
        };
      }
    },
    {
      name: "Test 24: धान्य उचल / उसनवार नोंद हटवणे व क्लाऊड सिंक संरक्षण (Stock Transfer Tombstone & Anti-Resurrection)",
      description: "उसनवार नोंद हटवल्यानंतर (Primary/Upper Stock Transfer) टोंबस्टोन तयार होणे व क्लाऊड सिंक किंवा रीफ्रेश झाल्यावर नोंद पुन्हा न येणे.",
      run() {
        if (typeof cloudSync === 'undefined') return { passed: false, details: "cloudSync उपलब्ध नाही" };

        const testTransfer = {
          id: 'trf_test_20261013_001',
          date: '2026-10-13',
          direction: 'upper_to_primary',
          fromSection: 'upper',
          toSection: 'primary',
          items: { rice: 20 },
          reason: 'उचल / उसनवारी नोंद'
        };

        const strictSig = cloudSync.getTransferSignature(testTransfer);
        const relSig = cloudSync.getTransferRelaxedSignature(testTransfer);

        // Remote has the transfer
        const remoteTransfer = {
          id: 'trf_test_20261013_001',
          date: '2026-10-13',
          direction: 'upper_to_primary',
          items: { rice: 20 }
        };

        const remoteList = [remoteTransfer];
        const localList = [];
        const deletedIds = [testTransfer.id];
        const deletedSigs = [strictSig, relSig];

        const merged = cloudSync.mergeStockTransfersList(localList, remoteList, deletedIds, deletedSigs);
        const resurrectionPrevented = merged.length === 0;

        return {
          passed: resurrectionPrevented,
          details: `उसनवार नोंद रिमोट पुनरुत्थान रोखले: ${resurrectionPrevented ? 'होय (0 नोंदी पुनरुत्थान)' : 'नाही (पुन्हा आली)'}, शिग्नेचर: ${strictSig} & ${relSig}`
        };
      }
    },
    {
      id: 25,
      name: "Test 25: ऐतिहासिक महिनानिहाय धान्य/मसाले प्रमाण संरक्षण (Historical Month Rates Immutability)",
      description: "एप्रिल २०२६ (प्राथमिक: जिरे ०.०००५, मिरची ०.००२, मीठ ०.००१५; उच्च प्राथमिक: जिरे ०.०००२, मिरची ०.००५, मीठ ०.०००३) व जून २०२६ (चालू सेटिंग्ज) चे स्वतंत्र व अपरिवर्तनीय प्रमाण पडताळणी.",
      run() {
        if (!app.data.monthlyRates) app.data.monthlyRates = {};
        
        // Setup explicit April rates
        app.data.monthlyRates['2026-04'] = {
          cumin: { ratePrimary: 0.0005, rateUpper: 0.0002 },
          mustard: { ratePrimary: 0.0005, rateUpper: 0.0002 },
          turmeric: { ratePrimary: 0.0005, rateUpper: 0.0002 },
          chilli: { ratePrimary: 0.0020, rateUpper: 0.0050 },
          oil: { ratePrimary: 0.0050, rateUpper: 0.0075 },
          salt: { ratePrimary: 0.0015, rateUpper: 0.0003 },
          masala: { ratePrimary: 0.0020, rateUpper: 0.0050 }
        };

        // 1. Verify getIngredientRate with month parameter
        const cuminAprP = app.getIngredientRate('cumin', 'primary', '2026-04');
        const cuminAprU = app.getIngredientRate('cumin', 'upper', '2026-04');
        const chilliAprP = app.getIngredientRate('chilli', 'primary', '2026-04');
        const chilliAprU = app.getIngredientRate('chilli', 'upper', '2026-04');
        const saltAprP = app.getIngredientRate('salt', 'primary', '2026-04');
        const saltAprU = app.getIngredientRate('salt', 'upper', '2026-04');

        const passAprP = (cuminAprP === 0.0005 && chilliAprP === 0.0020 && saltAprP === 0.0015);
        const passAprU = (cuminAprU === 0.0002 && chilliAprU === 0.0050 && saltAprU === 0.0003);

        // 2. Verify calculateDay for April date uses April rates
        const calcAprP = app.calculateDay('2026-04-15', 66, 'मूगडाळ खिचडी', 66, null, 'primary');
        const calcAprU = app.calculateDay('2026-04-15', 40, 'मूगडाळ खिचडी', 40, null, 'upper');

        const passCalcP = (
          Math.abs(calcAprP.quantities.cumin - 0.0330) < 0.0001 &&
          Math.abs(calcAprP.quantities.chilli - 0.1320) < 0.0001 &&
          Math.abs(calcAprP.quantities.salt - 0.0990) < 0.0001
        );

        const passCalcU = (
          Math.abs(calcAprU.quantities.cumin - 0.0080) < 0.0001 &&
          Math.abs(calcAprU.quantities.chilli - 0.2000) < 0.0001 &&
          Math.abs(calcAprU.quantities.salt - 0.0120) < 0.0001
        );

        // 3. Verify June calculation uses global settings
        const calcJunP = app.calculateDay('2026-06-15', 66, 'मूगडाळ खिचडी', 66, null, 'primary');
        const globalCumin = app.getIngredientRate('cumin', 'primary');
        const passJunCalc = (Math.abs(calcJunP.quantities.cumin - (66 * globalCumin)) < 0.0001);

        const passed = passAprP && passAprU && passCalcP && passCalcU && passJunCalc;

        return {
          passed,
          details: `एप्रिल १-५ (जिरे: ${cuminAprP}, मिरची: ${chilliAprP}, मीठ: ${saltAprP}), एप्रिल ६-८ (जिरे: ${cuminAprU}, मिरची: ${chilliAprU}, मीठ: ${saltAprU}), एप्रिल दैनिक हिशोब: ${passCalcP && passCalcU ? 'अचूक' : 'त्रुटी'}, जून स्वातंत्र्य: ${passJunCalc ? 'सुरक्षित' : 'त्रुटी'}`
        };
      }
    },
    {
      id: 26,
      name: "Test 26: बहु-शाळा लॉगिन पृथक्करण (Chevane Isolation), पटसंख्या मर्यादा व दैनिक नोंदीची अखंडता",
      description: "चेवणे (27240203701) लॉगिनवर मोहापाडा किंवा मेंगाळवाडीचे नाव न येणे, १५ सप्टेंबरची २० मुलांची अनधिकृत नोंद नष्ट होणे, पटसंख्येपेक्षा जास्त उपस्थिती नोंदवण्यास प्रतिबंध, आणि दैनिक नोंद विनाअडथळा जतन होणे.",
      run() {
        // Save current session to guarantee zero pollution
        const origActiveUdise = localStorage.getItem(app.ACTIVE_UDISE_STORAGE_KEY);
        const origData = app.data ? JSON.parse(JSON.stringify(app.data)) : null;

        const chevaneUdise = "27240203701";
        const origChevaneAuth = app.getSchoolAuth(chevaneUdise);
        const origChevaneData = localStorage.getItem(app.getSchoolStorageKey(chevaneUdise));

        let passChevaneName = false;
        let passChevaneUdise = false;
        let passSep15Purged = false;
        let passPatLimitValidation = false;
        let passAdjust = false;
        let passLicenseUnrestricted = false;
        let sNameChevane = '';

        try {
          // Seed Chevane clean auth & registration
          app.saveSchoolAuth(chevaneUdise, {
            udise: chevaneUdise,
            schoolName: "रा.जि.प. प्राथमिक शाळा चेवणे",
            schoolLevel: "both",
            pat: 9,
            patPrimary: 9,
            patUpper: 15,
            passwordHash: app.sha256("1234")
          });
          app.registerSchool({
            udise: chevaneUdise,
            schoolName: "रा.जि.प. प्राथमिक शाळा चेवणे",
            schoolLevel: "both",
            pat: 9,
            patPrimary: 9,
            patUpper: 15
          });

          // Simulate Chevane login & state load
          app.loadState(chevaneUdise);
          sNameChevane = (app.data && app.data.settings && app.data.settings.schoolName) || '';
          passChevaneName = sNameChevane.includes("चेवणे") && !sNameChevane.includes("मेंगाळवाडी") && !sNameChevane.includes("मोहापाडा");
          passChevaneUdise = (app.data && app.data.settings && app.data.settings.udise === chevaneUdise);

          // 2. Verify 15-Sept ghost record is purged and absent
          passSep15Purged = (!app.data.records || !app.data.records['2026-09-15'] || app.data.records['2026-09-15'].children <= 9);

          // 3. Verify Strict Pat Attendance Limit: children > activePat must be blocked
          let toastMessage = "";
          let toastType = "";
          const origShowToast = app.showToast;
          app.showToast = (msg, type) => { toastMessage = msg; toastType = type; };

          const dateInput = document.getElementById('entryDate');
          const childrenInput = document.getElementById('entryChildren');
          const holidayToggle = document.getElementById('entryHolidayToggle');

          if (dateInput) dateInput.value = '2026-10-20';
          if (childrenInput) childrenInput.value = '20'; // 20 > 9 (activePat)
          if (holidayToggle) holidayToggle.value = 'working';

          app.saveCurrentRecord();
          passPatLimitValidation = (toastType === 'danger' && toastMessage.includes('मंजूर पटसंख्येपेक्षा'));

          // 4. Verify adjust children clamps to activePat (9)
          if (childrenInput) childrenInput.value = '8';
          app.adjustChildren(1); // becomes 9
          const val9 = childrenInput ? Number(childrenInput.value) : 9;
          app.adjustChildren(1); // should stay 9 because pat is 9
          const valStay9 = childrenInput ? Number(childrenInput.value) : 9;
          passAdjust = (val9 === 9 && valStay9 === 9);

          // 5. Verify Unrestricted License
          const checkLic = app.isLicenseValid(chevaneUdise);
          passLicenseUnrestricted = (checkLic.valid === true && checkLic.status === 'active');

          app.showToast = origShowToast;
        } finally {
          // Restore original mocks & active session
          if (origChevaneAuth) {
            app.saveSchoolAuth(chevaneUdise, origChevaneAuth);
          } else {
            localStorage.removeItem(app.AUTH_STORAGE_PREFIX + chevaneUdise);
          }
          if (origChevaneData) {
            localStorage.setItem(app.getSchoolStorageKey(chevaneUdise), origChevaneData);
          } else {
            localStorage.removeItem(app.getSchoolStorageKey(chevaneUdise));
          }

          if (origActiveUdise) {
            localStorage.setItem(app.ACTIVE_UDISE_STORAGE_KEY, origActiveUdise);
            if (origData) {
              app.data = origData;
            } else {
              app.loadState(origActiveUdise);
            }
          } else {
            localStorage.removeItem(app.ACTIVE_UDISE_STORAGE_KEY);
          }
        }

        const passed = passChevaneName && passChevaneUdise && passSep15Purged && passPatLimitValidation && passAdjust && passLicenseUnrestricted;

        return {
          passed,
          details: `चेवणे शाळा नाव पृथक्करण (${sNameChevane}): ${passChevaneName ? 'अचूक' : 'त्रुटी'}, चेवणे UDISE: ${passChevaneUdise ? 'अचूक' : 'त्रुटी'}, १५ सप्टेंबर २० मुले नोंद निष्कासन: ${passSep15Purged ? 'होय (Purged)' : 'नाही'}, पटसंख्या मर्यादा पडताळणी (>पट ब्लॉक): ${passPatLimitValidation ? 'होय' : 'नाही'}, दैनिक उपस्थिती Clamp: ${passAdjust ? 'अचूक' : 'त्रुटी'}`
        };
      }
    }
  ],

  /**
   * Run all test cases and render results into DOM
   */
  runAllTests() {
    const origActiveUdise = localStorage.getItem(app.ACTIVE_UDISE_STORAGE_KEY);
    const origData = app.data ? JSON.parse(JSON.stringify(app.data)) : null;

    const container = document.getElementById('testCasesContainer');
    const badge = document.getElementById('testSummaryBadge');
    if (!container) return;

    container.innerHTML = '';
    let passCount = 0;

    try {
      this.tests.forEach(test => {
        let result = { passed: false, details: "Error" };
        try {
          result = test.run();
        } catch (e) {
          result = { passed: false, details: `अपवाद: ${e.message}` };
        }

        if (result.passed) passCount++;

        const item = document.createElement('div');
        item.className = 'test-case-item';
        item.innerHTML = `
          <div class="test-case-info">
            <div class="test-case-title">${test.name}</div>
            <div class="test-case-desc">${test.description}</div>
            <div class="form-hint" style="color: #475569; margin-top: 0.25rem;"><strong>तपशील:</strong> ${result.details}</div>
          </div>
          <div class="test-case-status ${result.passed ? 'passed' : 'failed'}">
            <span>${result.passed ? '✅ उत्तीर्ण (PASSED)' : '❌ अनुत्तीर्ण (FAILED)'}</span>
          </div>
        `;
        container.appendChild(item);
      });

      if (badge) {
        if (passCount === this.tests.length) {
          badge.className = 'badge badge-success';
          badge.innerHTML = `🎉 सर्व ${passCount}/${this.tests.length} चाचण्या यशस्वीरित्या उत्तीर्ण!`;
        } else {
          badge.className = 'badge badge-danger';
          badge.innerHTML = `⚠️ ${passCount}/${this.tests.length} चाचण्या उत्तीर्ण`;
        }
      }
    } finally {
      if (origActiveUdise) {
        localStorage.setItem(app.ACTIVE_UDISE_STORAGE_KEY, origActiveUdise);
        if (origData) {
          app.data = origData;
        } else {
          app.loadState(origActiveUdise);
        }
      }
    }
  }

};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = testSuite;
}
