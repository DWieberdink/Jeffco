// Quick layout diagnostic - run this in browser console
(function() {
  const container = document.getElementById('container');
  const mapContainer = document.getElementById('map-container');
  const mapSidebar = document.getElementById('map-sidebar');
  
  console.log('=== Layout Check ===');
  console.log('Container display:', getComputedStyle(container).display);
  console.log('Container flex-direction:', getComputedStyle(container).flexDirection);
  console.log('Container children:', Array.from(container.children).map(c => c.id || c.className));
  
  console.log('\nMap Container:');
  console.log('  flex:', getComputedStyle(mapContainer).flex);
  console.log('  width:', getComputedStyle(mapContainer).width);
  console.log('  offsetWidth:', mapContainer.offsetWidth);
  console.log('  position:', getComputedStyle(mapContainer).position);
  
  console.log('\nMap Sidebar:');
  console.log('  flex:', getComputedStyle(mapSidebar).flex);
  console.log('  width:', getComputedStyle(mapSidebar).width);
  console.log('  offsetWidth:', mapSidebar.offsetWidth);
  console.log('  offsetLeft:', mapSidebar.offsetLeft);
  console.log('  position:', getComputedStyle(mapSidebar).position);
  console.log('  z-index:', getComputedStyle(mapSidebar).zIndex);
  
  // Check if sidebar is actually inside container
  console.log('\nIs sidebar inside container?', container.contains(mapSidebar));
  console.log('Sidebar parent:', mapSidebar.parentElement.id);
  
  // Check if they overlap
  const mapRect = mapContainer.getBoundingClientRect();
  const sidebarRect = mapSidebar.getBoundingClientRect();
  console.log('\n=== Overlap Check ===');
  console.log('Map container right edge:', mapRect.right);
  console.log('Sidebar left edge:', sidebarRect.left);
  console.log('Do they overlap?', mapRect.right > sidebarRect.left);
  console.log('Expected: Sidebar should start where map container ends');
})();

