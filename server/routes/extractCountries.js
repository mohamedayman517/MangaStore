// ! This file is used to extract country data from the country-list-with-dial-code-and-flag package and save it to a json file.

const fs = require("fs");
// const countries = require("country-list-with-dial-code-and-flag");

// const country = [];
// countries.default.getAll().forEach((count) => {
//   country.push({
//     name: count.data.name,
//     dial_code: count.data.dial_code,
//     code: count.data.code,
//     flag: count.data.flag,
//   });
// });
// fs.writeFileSync("countries.json", JSON.stringify(country));
// console.log("✅ Country data extracted and saved to countries.json");

// const fs = require("fs");

const dataPath = "./public/assets/countries-cities.json"; // Path to your JSON file

// Read the local JSON file
fs.readFile(dataPath, "utf8", (err, data) => {
  if (err) {
    console.error("Error reading file:", err);
    return;
  }

  try {
    // Parse JSON
    const countries = JSON.parse(data);

    // Extract required fields
    const extractedData = countries.map((country) => ({
      phonecode: `+${country.phonecode}`,
      iso2: country.iso2,
      name: country.name,
      cities: country.cities.map((city) => city.name),
      flag: `https://flagcdn.com/w320/${country.iso2.toLowerCase()}.png`,
    }));

    // Convert to minified JSON string
    const jsonString = JSON.stringify(extractedData);

    // Save minified JSON
    fs.writeFileSync("countries.min.json", jsonString);

    console.log("Minified file saved as countries.min.json");
  } catch (parseError) {
    console.error("Error parsing JSON:", parseError);
  }
});
