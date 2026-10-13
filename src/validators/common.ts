import { z } from 'zod'

// Sirf http / https links. Warna "javascript:..." ya "data:..." jaisa link save ho kar
// kisi ke click pe chal sakta hai
export const webUrl = (message = 'Enter a valid URL') =>
  z.url({ protocol: /^https?$/, error: message })
