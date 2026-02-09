
import { discoverSkills } from '../src/skills/registry';

console.log('Discovering skills...');
const skills = discoverSkills();

console.log(`Found ${skills.length} skills:`);
skills.forEach(skill => {
    console.log(`- ${skill.name} (${skill.source}): ${skill.description.substring(0, 50)}...`);
});

if (skills.some(s => s.name === 'technical_analysis')) {
    console.log('SUCCESS: technical_analysis found');
} else {
    console.error('FAIL: technical_analysis NOT found');
    process.exit(1);
}

if (skills.some(s => s.name === 'disclosure_analysis')) {
    console.log('SUCCESS: disclosure_analysis found');
} else {
    console.error('FAIL: disclosure_analysis NOT found');
    process.exit(1);
}

if (skills.some(s => s.name === 'integrated_strategy')) {
    console.log('SUCCESS: integrated_strategy found');
} else {
    console.error('FAIL: integrated_strategy NOT found');
    process.exit(1);
}
