document.addEventListener("DOMContentLoaded", () => {
  // Store the original HTML content when the page loads
  const productGrid = document.querySelector("#products-grid");
  const originalProductsHTML = productGrid?.innerHTML || "";

  // Get all products from the DOM - convert them to a JavaScript array
  const allProducts = Array.from(document.querySelectorAll(".card[data-id]")).map((card) => {
    return {
      id: card.getAttribute("data-id"),
      name: card.getAttribute("data-title"),
      price: Number.parseFloat(card.getAttribute("data-price")),
      description: card.getAttribute("data-description"),
      images: card.getAttribute("data-img"),
      startDate: card.getAttribute("data-discount-startDate") || null,
      endDate: card.getAttribute("data-discount-endDate") || null,
      discount: card.getAttribute("data-discount-price-after") || null,
      bfDiscount: card.getAttribute("data-discount-price-before") || null, // Added to handle before discount price
    };
  });

  // Get the search input element
  const searchInput = document.getElementById("search");
  const currency = "EG"; // Default currency, should be dynamically set based on your application state

  // Add input event listener with debounce
  searchInput.addEventListener(
    "input",
    debounce(() => {
      const searchTerm = searchInput.value.trim().toLowerCase();

      // If search is empty, restore original products
      if (searchTerm === "") {
        productGrid.innerHTML = originalProductsHTML;

        // Re-initialize the countdown for restored products
        initializeCountdown();

        // Update the results count
        updateResultsCount(allProducts.length);

        // Re-initialize the add to cart event listeners
        initializeCartButtons();
        return;
      }

      // Filter products based on search term
      const filteredProducts = allProducts.filter(
        (product) =>
          product.name.toLowerCase().includes(searchTerm) || product.description.toLowerCase().includes(searchTerm)
      );

      // Update the results count
      updateResultsCount(filteredProducts.length);

      // Generate HTML for filtered products
      if (filteredProducts.length > 0) {
        productGrid.innerHTML = generateProductsHTML(filteredProducts, currency);

        // Re-initialize the countdown for filtered products
        initializeCountdown();

        // Re-initialize the add to cart event listeners
        initializeCartButtons();
      } else {
        productGrid.innerHTML = `
          <div class="h-full w-full flex items-center justify-center text-xl font-semibold text-orange-700 col-span-3 bg-primary-light dark:bg-primary-dark rounded-lg shadow-sm">
            No results found
          </div>
        `;
      }
    }, 300)
  );

  // Function to update the results count
  function updateResultsCount(count) {
    const resultsElement = document.querySelector("span.text-text-light.dark\\:text-text-dark");
    if (resultsElement) {
      resultsElement.textContent = `Results (${count})`;
    }
  }

  // Function to initialize countdown timer for products with discounts
  function initializeCountdown() {
    const countdownElements = document.querySelectorAll(".countdown");

    countdownElements.forEach((element) => {
      if (!element.getAttribute("data-end-date")) return;

      const endDate = new Date(element.dataset.endDate);
      const startDate = new Date(element.dataset.startDate);

      function updateCountdown() {
        const now = new Date();
        const remainingTime = endDate - now;

        if (remainingTime > 0) {
          const days = String(Math.floor(remainingTime / (1000 * 60 * 60 * 24))).padStart(2, "0");
          const hours = String(Math.floor((remainingTime / (1000 * 60 * 60)) % 24)).padStart(2, "0");
          const minutes = String(Math.floor((remainingTime / (1000 * 60)) % 60)).padStart(2, "0");
          const seconds = String(Math.floor((remainingTime / 1000) % 60)).padStart(2, "0");
          element.innerHTML = `<i class="fa fa-clock mr-2"></i> Ends in ${days}d ${hours}h ${minutes}m ${seconds}s`;
        } else {
          element.textContent = "";
          element.classList.add("!hidden");
        }
      }

      updateCountdown();
      const intervalId = setInterval(updateCountdown, 1000);

      // Store the interval ID to clear it if needed
      element._countdownInterval = intervalId;
    });
  }

  // Initialize cart buttons event listeners
  function initializeCartButtons() {
    document.querySelectorAll(".addToCartBtn").forEach((btn) => {
      // Remove existing event listeners if any
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);

      // Add new event listener
      newBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const card = this.closest(".card");
        if (card) {
          // Your existing cart adding logic - call the function from your cart.js
          if (typeof addToCart === "function") {
            addToCart(card.getAttribute("data-id"));
          } else {
            console.error("addToCart function is not defined."); // Handle the case where addToCart is not defined.
          }
        }
      });
    });

    // Re-initialize card click for product details
    document.querySelectorAll(".card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (!e.target.closest(".addToCartBtn")) {
          window.location.href = `/view/product/${card.getAttribute("data-id")}`;
        }
      });
    });
  }

  // Generate HTML for a list of products
  function generateProductsHTML(products, currency) {
    if (products.length === 0) {
      return `
          <div class="h-full w-full flex items-center justify-center text-xl font-semibold text-orange-700 col-span-3 bg-primary-light dark:bg-primary-dark rounded-lg shadow-sm">
            No results found
          </div>
        `;
    }

    return products
      .map((product) => {
        const now = new Date();
        const hasDiscount = product.discount !== null && product.startDate && now - new Date(product.startDate) > 0;

        return `
          <div data-id="${product.id}" data-title="${product.name}" data-price="${Number(product.price).toFixed(2)}"
            data-description="${product.description}"
            data-img="${product.images}"
            ${
              hasDiscount
                ? `
            data-discount-startDate="${product.startDate}" data-discount-endDate="${product.endDate}"
            data-discount-price-after="${product.price}"
            data-discount-price-before="${product.bfDiscount}" // Added to handle before discount price
            `
                : ""
            }
            class="card bg-background-light dark:bg-background-dark border-primary-light dark:border-primary-dark relative sm:min-w-[200px] w-full sm:h-[280px] flex-row lg:hover:scale-105 transition-all duration-150 ease-linear cursor-pointer text-text-light dark:text-text-dark p-4 rounded-lg shadow-sm flex sm:flex-col items-center justify-between border-2 flex-1 xl:col-span-1 col-span-6 sm:col-span-3">
  
            <div class="img_container xs:h-40 xs:w-40 vxs:h-32 vxs:w-32 sm:h-52 sm:w-max aspect-square overflow-hidden rounded-lg flex items-center justify-center mr-6 bg-background-light dark:bg-background-dark">
              <img src="${product.images}" alt="${product.name}" class="card-img h-full w-auto object-contain" />
            </div>
            <div class="card_details mt-3 text-center w-full sm:h-max h-full sm:min-h-24">
              <div class="item_name flex flex-col h-full justify-start px-2 items-center font-medium">
                <span class="card-title w-full text-left line-clamp-2 text-sm sm:text-[16px] font-semibold mb-2">${
                  product.name
                }</span>
  
                <div class="w-full flex xs:flex-row flex-col sm:flex-row gap-2 justify-start items-center">
                  ${
                    hasDiscount
                      ? `
                    <div class="flex items-center justify-start">
                      <span class="card-dsPrice text-sm line-through font-light">${product.bfDiscount} ${
                          currency == "EG" ? "L.E" : "$"
                        }</span>
                      <span class="card-dsPrice px-2 py-1 rounded-lg text-sm ml-1">${product.discount} ${
                          currency == "EG" ? "L.E" : "$"
                        }</span>
                    </div>
                  `
                      : ""
                  }
                  <span class="card-price text-lg font-bold text-left sm:font-semibold">${product.price} ${
          currency == "EG" ? "L.E" : "$"
        }</span>
                </div>
                ${
                  hasDiscount
                    ? `
                <div class="w-full">
                  <span
                    data-end-date="${product.endDate}"
                    data-start-date="${product.startDate}"
                    class="countdown flex justify-start w-full items-center text-sm sm:text-sm"></span>
                </div>
                `
                    : ""
                }
                <div class="w-full my-auto sm:hidden xs:block"${
                  hasDiscount ? ` style="@media(max-width:480px){display: none;}"` : ""
                }>
                  <span class="pr-10 text-left xs:!line-clamp-3 vxs:line-clamp-2 vxs:text-[11px] xs:text-sm">${
                    product.description
                  }</span>
                </div>
              </div>
            </div>
  
            <div class="cta flex items-center justify-around mt-4 absolute right-12 bottom-12 h-max w-max">
              <span>
                <button
                  type="button"
                  class="addToCartBtn bg-secondary-light dark:text-primary-dark text-text-light dark:bg-secondary-dark sm:rounded-lg sm:hover:bg-primary-light active:bg-primary-dark transition-all duration-200 active:scale-95 rounded-full w-10 h-10 absolute">
                  <i class="fa-solid fa-cart-shopping"></i>
                </button>
              </span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // Debounce function to limit how often the search function is called
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Initialize countdowns on page load
  initializeCountdown();
});
