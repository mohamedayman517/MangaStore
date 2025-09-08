// Store all products data
let allProducts = [];

// Fetch products when the page loads
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("/all-products");
    if (!response.ok) {
      throw new Error("Failed to fetch products");
    }
    allProducts = (await response.json()).products;
  } catch (error) {
    console.error("Error fetching products:", error);
  }
});

// Handle search focus and blur
function handleSearchFocus(isFocused) {
  const icons = document.querySelectorAll(".fa");
  const cartCounter = document.querySelector("#cart-counter");
  const searchInput = document.getElementById("searchInput");
  const navLinks = document.getElementById("menu-pc");

  if (isFocused) {
    // Fade out icons
    icons.forEach((icon) => {
      icon.style.opacity = "0";
      setTimeout(() => {
        icon.style.display = "hidden";
      }, 300); // Match the duration of the transition
    });

    cartCounter.classList.add("opacity-0");
    setTimeout(() => {
      cartCounter.classList.add("hidden");
    }, 300);

    navLinks.classList.add("opacity-0");
    setTimeout(() => {
      navLinks.style.display = "none";
    }, 250);

    // Show search results if there's input
    if (searchInput.value.trim().length > 0) {
      performSearch(searchInput.value);
    }
  } else {
    // Hide search results after a short delay (allows for clicking on results)
    setTimeout(() => {
      document.getElementById("searchResults").classList.add("hidden");

      // Fade in icons
      icons.forEach((icon) => {
        icon.style.display = "";
        setTimeout(() => {
          icon.style.opacity = "1";
        }, 10);
      });

      navLinks.style.display = "";
      setTimeout(() => {
        navLinks.classList.remove("opacity-0");
        navLinks.classList.add("opacity-1");
      }, 300);

      cartCounter.classList.remove("hidden");
      setTimeout(() => {
        cartCounter.classList.remove("opacity-0");
      }, 10);
    }, 200);
  }
}

// Search functionality
const searchInput = document.getElementById("searchInput");
searchInput.addEventListener("input", (e) => {
  const query = e.target.value.trim();
  if (query.length > 0) {
    performSearch(query);
  } else {
    document.getElementById("searchResults").classList.add("hidden");
  }
});

// Perform search and display results
async function performSearch(query) {
  if (!allProducts || allProducts.length === 0) {
    return;
  }

  query = query.toLowerCase();

  // Filter products based on search query
  const filteredProducts = allProducts.filter(
    (product) =>
      product.name?.toLowerCase().includes(query) ||
      product.description?.toLowerCase().includes(query) ||
      product.category?.toLowerCase().includes(query)
  );

  const resultsContainer = document.getElementById("searchResults");
  const resultsContent = document.getElementById("searchResultsContent");

  if (filteredProducts.length === 0) {
    resultsContent.innerHTML = '<p class="text-center py-2">No products found</p>';
  } else {
    // Limit to 5 results for better UX
    const limitedResults = filteredProducts.slice(0, 5);

    const currency = document.cookie
      .split("; ")
      .find((row) => row.startsWith("currency="))
      .split("=")[1];

    resultsContent.innerHTML = limitedResults
      .map(
        (product) => `
       <a href="/view/product/${
         product.id
       }" class="block p-2 hover:bg-primary-light/10 dark:hover:bg-primary-dark/20 rounded transition-colors duration-200">
         <div class="flex items-center gap-2">
           <div class="w-10 h-10 bg-gray-200 rounded overflow-hidden flex-shrink-0">
             ${
               product.images
                 ? `<img src="${product.images}" alt="${product.name}" class="w-full h-full object-cover">`
                 : ""
             }
           </div>
           <div class="flex-1 min-w-0">
             <p class="font-medium truncate">${product.name}</p>
             <p class="text-xs text-text-light/70 dark:text-text-dark/70 truncate">${product.categoryId || ""}</p>
           </div>
           <div class="text-secondary-light dark:text-secondary-dark font-bold">
             ${Number(product.price).toFixed(2) + (currency === "US" ? "$" : "L.E")}
           </div>
         </div>
       </a>
     `
      )
      .join("");
  }

  resultsContainer.classList.remove("hidden");
}

// Close search results when clicking outside
document.addEventListener("click", (e) => {
  const searchContainer = document.querySelector(".mr-8.relative");
  const searchResults = document.getElementById("searchResults");

  if (!searchContainer.contains(e.target) && !searchResults.classList.contains("hidden")) {
    searchResults.classList.add("hidden");
  }
});

// Profile popup functionality
const profileIcon = document.getElementById("profile-icon");
const cartIcon = document.getElementById("cart-icon");
const profilePopup = document.getElementById("profilePopup");

profileIcon.addEventListener("click", () => {
  profilePopup.classList.toggle("hidden");
});

window.addEventListener("click", (e) => {
  if (e.target === profilePopup) {
    profilePopup.classList.add("hidden");
  }
  if (e.target === document.getElementById("closeProfilePopup")) {
    profilePopup.classList.add("hidden");
  }
});

// Sidebar functionality
const menu = document.getElementById("menu");
const darkBg = document.getElementById("dark-bg");
const menuBtn = document.getElementById("menuBtn");
const closeBtn = document.getElementById("closeBtn");

// Open Sidebar (Left)
menuBtn.addEventListener("click", () => {
  menu.classList.toggle("-translate-x-full");
  menu.classList.toggle("translate-x-0");
  darkBg.classList.toggle("hidden");
});

// Close Sidebar
closeBtn.addEventListener("click", () => {
  menu.classList.add("-translate-x-full");
  menu.classList.remove("translate-x-0");
  darkBg.classList.add("hidden");
});

// Close when clicking outside
darkBg.addEventListener("click", () => {
  menu.classList.add("-translate-x-full");
  menu.classList.remove("translate-x-0");
  darkBg.classList.add("hidden");
});
// Assuming allProducts and searchInput are defined elsewhere, likely imported or declared in a parent scope.
// For example:
// import { allProducts } from './products';
// const searchInput = document.getElementById('searchInput');

// Add this function to handle navigation to the search results page
function navigateToSearchResults(query) {
  if (query && query.trim().length > 0) {
    window.location.href = `/products?search=${encodeURIComponent(query.trim())}`;
  }
}

// Modify the performSearch function to add a "Show All Results" button
async function performSearch(query) {
  if (!allProducts || allProducts.length === 0) {
    return;
  }

  query = query.toLowerCase();

  // Filter products based on search query
  const filteredProducts = allProducts.filter(
    (product) =>
      product.name?.toLowerCase().includes(query) ||
      product.description?.toLowerCase().includes(query) ||
      product.category?.toLowerCase().includes(query)
  );

  const resultsContainer = document.getElementById("searchResults");
  const resultsContent = document.getElementById("searchResultsContent");

  if (filteredProducts.length === 0) {
    resultsContent.innerHTML = '<p class="text-center py-2">No products found</p>';
  } else {
    // Limit to 5 results for better UX
    const limitedResults = filteredProducts.slice(0, 5);

    const currencyCookie = document.cookie.split("; ").find((row) => row.startsWith("currency="));
    const currency = currencyCookie ? currencyCookie.split("=")[1] : "EG";

    resultsContent.innerHTML = limitedResults
      .map(
        (product) => `
       <a href="/view/product/${
         product.id
       }" class="block p-2 hover:bg-primary-light/10 dark:hover:bg-primary-dark/20 rounded transition-colors duration-200">
         <div class="flex items-center gap-2">
           <div class="w-10 h-10 bg-gray-200 rounded overflow-hidden flex-shrink-0">
             ${
               product.images
                 ? `<img src="${product.images}" alt="${product.name}" class="w-full h-full object-cover">`
                 : ""
             }
           </div>
           <div class="flex-1 min-w-0">
             <p class="font-medium truncate">${product.name}</p>
             <p class="text-xs text-text-light/70 dark:text-text-dark/70 truncate">${product.categoryId || ""}</p>
           </div>
           <div class="text-secondary-light dark:text-secondary-dark font-bold">
             ${Number(product.price).toFixed(2) + (currency === "US" ? "$" : "L.E")}
           </div>
         </div>
       </a>
     `
      )
      .join("");

    // Add "Show All Results" button
    resultsContent.innerHTML += `
      <div class="p-2 border-t mt-2">
        <button id="showAllResults" class="w-full py-2 text-center text-sm font-medium text-primary-light dark:text-primary-dark hover:bg-primary-light/10 dark:hover:bg-primary-dark/20 rounded transition-colors duration-200">
          Show All Results
        </button>
      </div>
    `;
  }

  resultsContainer.classList.remove("hidden");

  // Add event listener to the "Show All Results" button
  const showAllBtn = document.getElementById("showAllResults");
  if (showAllBtn) {
    showAllBtn.addEventListener("click", () => navigateToSearchResults(query));
  }
}

// Add event listener for Enter key on search input
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    navigateToSearchResults(searchInput.value);
  }
});
