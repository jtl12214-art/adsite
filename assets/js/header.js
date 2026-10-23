const componentScript = document.currentScript;

async function loadComponent(selector, fileName) {
    const container = document.querySelector(selector);

    if (!container) {
        throw new Error(`Component container "${selector}" was not found.`);
    }

    const componentUrl = new URL(`../../component/${fileName}`, componentScript.src);
    const response = await fetch(componentUrl);

    if (!response.ok) {
        throw new Error(`Could not load ${componentUrl.href}: ${response.status} ${response.statusText}`);
    }

    container.innerHTML = await response.text();
    return container;
}

function initializeHeader(headerContainer) {
    const pixHeader = headerContainer.querySelector(".pix-header");
    const pixMenuButton = pixHeader?.querySelector(".pix-menu-toggle");
    const pixMobileNav = pixHeader?.querySelector("#pix-mobile-nav");

    if (!pixHeader || !pixMenuButton || !pixMobileNav) {
        throw new Error("The shared header is missing required menu elements.");
    }

    const currentPage = window.location.pathname.split("/").pop() || "index.html";

    pixHeader.querySelectorAll(".pix-nav-link").forEach(function (link) {
        const linkPage = new URL(link.getAttribute("href"), window.location.href).pathname.split("/").pop();
        const isCurrentPage = linkPage === currentPage;

        link.classList.toggle("is-active", isCurrentPage);

        if (isCurrentPage) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });

    const pixDesktopMediaQuery = window.matchMedia("(min-width: 1151px)");

    function setPixMobileMenuOpen(isOpen) {
        pixMenuButton.setAttribute("aria-expanded", String(isOpen));
        pixMenuButton.setAttribute("aria-label", isOpen ? "메뉴 닫기" : "메뉴 열기");
        pixMobileNav.hidden = !isOpen;
    }

    pixMenuButton.addEventListener("click", function () {
        setPixMobileMenuOpen(pixMenuButton.getAttribute("aria-expanded") !== "true");
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && pixMenuButton.getAttribute("aria-expanded") === "true") {
            setPixMobileMenuOpen(false);
            pixMenuButton.focus();
        }
    });

    pixDesktopMediaQuery.addEventListener("change", function (event) {
        if (event.matches) {
            setPixMobileMenuOpen(false);
        }
    });

    pixHeader.addEventListener("click", function (event) {
        if (event.target instanceof Element && event.target.closest('a[href="#"]')) {
            event.preventDefault();
        }
    });
}

async function initializePageComponents() {
    if (!componentScript) {
        throw new Error("The shared component script could not be identified.");
    }

    const [headerContainer] = await Promise.all([
        loadComponent("[data-component='header']", "header.html"),
        loadComponent("[data-component='footer']", "footer.html")
    ]);

    initializeHeader(headerContainer);
}

initializePageComponents().catch(function (error) {
    console.error("Failed to initialize shared page components.", error);
});
