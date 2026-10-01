import { z } from 'zod';

export const uploadSchema = z.object({
  file: z.instanceof(File)
    .refine((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'), 'Choose an English-language PDF file.')
    .refine((file) => file.size <= 20 * 1024 * 1024, 'PDF must be 20 MB or smaller.'),
});

export type AcademicCourse = { code: string; title: string; grade: string; credits: number; unitsLabel: string };
export type Credential = { institution: string; country: string; qualification: string; major: string; graduationDate: string };
export type CredentialVerification = {
  status: 'Digitally verified' | 'Verification unavailable' | 'Verification failed' | 'External credential evaluation recommended';
  explanation: string;
};
export type Requirement = { id: string; targetName: string; courseCode: string; description: string; prerequisiteConcepts: string[]; courseDescription: string };
export type MappingResult = 'Covered' | 'Partially covered' | 'Potential gap' | 'Insufficient evidence';
export type Mapping = { requirementId: string; matchedCourses: string[]; result: MappingResult; rationale: string; evidence: string; confidence: 'High' | 'Medium' | 'Low' };

export const requirements: Requirement[] = [
  { id: 'cs-1331', targetName: 'Introduction to Object-Oriented Programming', courseCode: 'CS 1331', description: 'Object-oriented programming, data abstraction, classes, inheritance, and testing.', prerequisiteConcepts: ['Programming fundamentals', 'Object-oriented design'], courseDescription: 'Introduction to object-oriented programming with Java. Topics include classes, inheritance, polymorphism, interfaces, exceptions, and testing.' },
  { id: 'cs-1332', targetName: 'Data Structures and Algorithms', courseCode: 'CS 1332', description: 'Implementation and analysis of fundamental data structures and algorithms.', prerequisiteConcepts: ['Data structures', 'Algorithm analysis', 'Recursion'], courseDescription: 'Covers data structures, including lists, stacks, queues, trees, heaps, hash tables and graphs, with algorithm analysis.' },
  { id: 'math-1552', targetName: 'Integral Calculus', courseCode: 'MATH 1552', description: 'Integral calculus and applications, including techniques and sequences/series.', prerequisiteConcepts: ['Integration techniques', 'Improper integrals', 'Sequences and series'], courseDescription: 'Integral calculus of one variable, with applications, techniques of integration, and an introduction to sequences and series.' },
  { id: 'phys-2211', targetName: 'Introductory Physics I', courseCode: 'PHYS 2211', description: 'Mechanics, motion, forces, energy, momentum, and rotational dynamics.', prerequisiteConcepts: ['Newtonian mechanics', 'Energy and momentum', 'Rotational motion'], courseDescription: 'Introductory calculus-based mechanics covering motion, forces, work and energy, momentum, and rotation.' },
  { id: 'engl-1101', targetName: 'English Composition I', courseCode: 'ENGL 1101', description: 'Rhetorical analysis, research, argument, and academic writing.', prerequisiteConcepts: ['Academic argument', 'Research writing', 'Rhetorical analysis'], courseDescription: 'A writing-intensive course focused on rhetorical knowledge, critical reading, research, and composing for varied audiences.' },
];

export const sampleCredential: Credential = {
  institution: 'Universidad Nacional de Colombia',
  country: 'Colombia',
  qualification: 'Bachelor of Science',
  major: 'Computer Science',
  graduationDate: 'June 2023',
};

export const sampleCourses: AcademicCourse[] = [
  { code: 'CS-201', title: 'Object-Oriented Programming', grade: '4.3 / 5.0', credits: 4, unitsLabel: 'local credits' },
  { code: 'CS-305', title: 'Data Structures', grade: '4.0 / 5.0', credits: 4, unitsLabel: 'local credits' },
  { code: 'MAT-204', title: 'Integral Calculus', grade: '3.8 / 5.0', credits: 4, unitsLabel: 'local credits' },
  { code: 'PHY-101', title: 'General Physics: Mechanics', grade: '3.6 / 5.0', credits: 3, unitsLabel: 'local credits' },
  { code: 'HUM-110', title: 'Academic Writing', grade: '4.1 / 5.0', credits: 2, unitsLabel: 'local credits' },
];

export async function extractMockRecord() {
  await new Promise((resolve) => window.setTimeout(resolve, 350));
  return { credential: sampleCredential, courses: sampleCourses };
}

export async function checkVerification(): Promise<CredentialVerification> {
  await new Promise((resolve) => window.setTimeout(resolve, 300));
  return { status: 'Verification unavailable' as const, explanation: 'No independent verification source is connected in this preliminary demonstration. Reading a document does not verify its authenticity.' };
}

export function mapMockCourses(target: string): Mapping[] {
  const targets = requirements.filter((requirement) => requirement.id === target || requirement.targetName === target);
  return targets.map((requirement) => {
    const mappings: Record<string, Omit<Mapping, 'requirementId'>> = {
      'cs-1331': { matchedCourses: ['CS-201 · Object-Oriented Programming'], result: 'Partially covered', rationale: 'The course title suggests a strong topic overlap. Syllabus and assessment detail are not available to confirm the full scope.', evidence: 'Course title only; no syllabus, contact hours, or assessment evidence is provided.', confidence: 'Medium' },
      'cs-1332': { matchedCourses: ['CS-305 · Data Structures'], result: 'Partially covered', rationale: 'Data structures are indicated by the course title; algorithm analysis and the full range of structures cannot be confirmed.', evidence: 'Course title only. Confirm coverage of trees, graphs, hashing, and complexity analysis.', confidence: 'Medium' },
      'math-1552': { matchedCourses: ['MAT-204 · Integral Calculus'], result: 'Partially covered', rationale: 'The title aligns with integral calculus, but sequences, series, and course-level outcomes are not documented.', evidence: 'Course title and reported grade; detailed syllabus unavailable.', confidence: 'Medium' },
      'phys-2211': { matchedCourses: ['PHY-101 · General Physics: Mechanics'], result: 'Partially covered', rationale: 'Mechanics is named, but calculus-based treatment and rotational dynamics are uncertain.', evidence: 'Course title only. No indication of calculus prerequisites or topic depth.', confidence: 'Low' },
      'engl-1101': { matchedCourses: ['HUM-110 · Academic Writing'], result: 'Insufficient evidence', rationale: 'The title indicates writing, but it does not establish the research, rhetoric, and composition outcomes in the target.', evidence: 'Course title only; language of instruction and writing samples are not available.', confidence: 'Low' },
    };
    return { requirementId: requirement.id, ...mappings[requirement.id] };
  });
}