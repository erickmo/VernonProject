frappe.ready(() => {
	alert(1);
	// cari container navbar kanan (posisi bisa beda antar versi/theme)
	const $right = $('.navbar .navbar-right');

	// insert tombol sebelum Help (atau di posisi terakhir)
	const $btn = $(`
    <li>
      <a class="nav-link" href="/app/your-page">
        Custom Menu
      </a>
    </li>
  `);

	$right.prepend($btn);
});