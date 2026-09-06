const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const fs = require('fs');
const scratch = 'C:/Users/orbet/AppData/Local/Temp/claude/C--iSched/3c5a79c6-d7e1-4d36-8612-481705af937b/scratchpad';
fs.writeFileSync(scratch + '/tw-test.html', '<div class="space-y-6"><div class="sticky top-0 -mt-4">a</div><div>b</div><div>c</div></div>');
const css = '@import "tailwindcss";\n@source "' + scratch + '/tw-test.html";\n';
fs.writeFileSync(scratch + '/in.css', css);
postcss([tailwind()]).process(css, { from: scratch + '/in.css' }).then(r => {
  fs.writeFileSync(scratch + '/tw-out.css', r.css);
  console.log('done, length', r.css.length);
}).catch(e => { console.error(e); process.exit(1); });
