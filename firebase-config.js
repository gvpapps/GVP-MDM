/**
 * शालेय पोषण आहार (PM POSHAN) - Google Firebase Realtime Database Configuration
 * 
 * GitHub रिपॉझिटरी / लाइव्ह होस्टिंग सूचना:
 * 1. खालील firebaseUrl मध्ये तुमच्या Firebase Realtime Database ची URL टाका.
 *    उदा. "https://your-project-default-rtdb.firebaseio.com"
 * 2. ही फाईल सेव्ह करून GitHub वर पुश करा. 
 * 3. ॲप आपोआप या डेटाबेसशी कनेक्ट होईल आणि एकाच वेळी महाराष्ट्रातील अनेक शाळा (Multi-School)
 *    स्वतंत्रपणे आपापल्या UDISE नुसार वापरू शकतील.
 * 
 * टीप: कोणतीही जुनी किंवा अस्तित्वात असलेली लिंक येथे दिलेली नाही.
 */

window.MDM_CONFIG = {
  // १. Google Firebase Realtime Database URL (येथे तुमची Firebase URL पेस्ट करा):
  // उदा. "https://your-project-name-default-rtdb.firebaseio.com"
  firebaseUrl: "",

  // २. ऑटोमॅटिक क्लाऊड बॅकअप व सिंक सुरू ठेवायचे का? (true = चालू)
  autoSync: true,

  // ३. मल्टी-स्कूल मोड (true = सर्व शाळा UDISE नुसार स्वतंत्रपणे डेटा वापरू शकतील)
  multiSchoolMode: true,

  // ४. सिंगल स्कूल मोड (false = पोर्टल मोड चालू, true = फक्त एकाच शाळेसाठी लॉक)
  singleSchoolMode: false
};

