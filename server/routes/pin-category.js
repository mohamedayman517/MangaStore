const router = require("express").Router();
const { db } = require("../utils/firebase");
const verifyAdmin = require("../middlewares/verifyAdmin");

// Route to fetch all categories and render pin-category.ejs
router.get("/pin-category", verifyAdmin, async (req, res) => {
  try {
    const categoriesSnapshot = await db.collection("categories").get();
    const categories = categoriesSnapshot.docs.map((doc) => doc.data());
    const pinnedcategoriesSnapshot = await db.collection("pinned-categories").get();
    const pinnedCategories = pinnedcategoriesSnapshot.docs.map((doc) => doc.data());
    res.render("pin-category", { categories, pinnedCategories });
  } catch (error) {
    console.error("Error fetching categories: ", error);
    res.status(500).send("Error fetching categories");
  }
});

router.post("/pin-category", verifyAdmin, async (req, res) => {
  try {
    const { categoryName } = req.body;
    await db.collection("pinned-categories").doc(categoryName).set({ name: categoryName });
    // res.redirect("/admin/pin-category");
    res.status(200).send("Category pinned successfully");
  } catch (error) {
    console.error("Error pinning category: ", error);
    res.status(500).send("Error pinning category");
  }
});

router.delete("/pin-category", verifyAdmin, async (req, res) => {
  try {
    const { categoryName } = req.body;
    await db.collection("pinned-categories").doc(categoryName).delete();
    res.status(200).send("Category unpinned successfully");
  } catch (error) {
    console.error("Error unpinning category: ", error);
    res.status(500).send("Error unpinning category");
  }
});

module.exports = router;
