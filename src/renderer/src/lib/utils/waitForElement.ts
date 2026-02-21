/**
 * Waits for an element to appear in the DOM and be rendered (visible dimensions)
 * @param elementId - The ID of the element to wait for
 * @param timeoutMs - Maximum time to wait in milliseconds (default 2000)
 * @returns Promise resolving to the HTMLElement when ready
 * @throws Error if element not found within timeout or element remains invisible
 */
export async function waitForElement(
  elementId: string,
  timeoutMs: number = 2000
): Promise<HTMLElement> {
  const startTime = performance.now();

  return new Promise((resolve, reject) => {
    const checkElement = () => {
      const element = document.getElementById(elementId);
      const elapsed = performance.now() - startTime;

      // Element found and has visible dimensions
      if (
        element &&
        (element.offsetWidth > 0 || element.offsetHeight > 0)
      ) {
        resolve(element);
        return;
      }

      // Timeout exceeded
      if (elapsed > timeoutMs) {
        if (!element) {
          reject(
            new Error(
              `Element with id "${elementId}" not found after ${timeoutMs}ms`
            )
          );
        } else {
          reject(
            new Error(
              `Element with id "${elementId}" not visible after ${timeoutMs}ms`
            )
          );
        }
        return;
      }

      // Schedule next check
      requestAnimationFrame(checkElement);
    };

    checkElement();
  });
}
